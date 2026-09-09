import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional, Tuple

from grokcall.core.models import CallStatus
from grokcall.core.ports import SpeechToTextPort, TelephonyLeg, TextToSpeechPort
from grokcall.core.registry import CallSession

logger = logging.getLogger("grokcall.pipeline")

ULAW_BYTES_PER_SECOND = 8000

TEXTS = {
    "connecting": {
        "sv": "Ett ögonblick så kopplar jag dig till {owner}s AI-assistent.",
        "en": "One moment while I connect you to {owner}'s AI assistant.",
    },
    "hold": {
        "sv": "Ett ögonblick till, assistenten är snart här.",
        "en": "Just a moment longer, the assistant will be right with you.",
    },
    "fallback_greeting": {
        "sv": (
            "Hej! {owner} kan inte svara just nu och detta är en automatisk assistent. "
            "Säg gärna ditt namn och vad det gäller, så ser jag till att {owner} får meddelandet."
        ),
        "en": (
            "Hi! {owner} cannot answer right now and this is an automated assistant. "
            "Please say your name and what it is about, and I will make sure {owner} gets the message."
        ),
    },
    "fallback_callback": {
        "sv": "Tack. Vill du att {owner} ringer upp dig?",
        "en": "Thank you. Would you like {owner} to call you back?",
    },
    "fallback_closing": {
        "sv": "Tack, jag har sparat ditt meddelande. Hej då!",
        "en": "Thank you, I have saved your message. Goodbye!",
    },
    "fallback_no_input": {
        "sv": "Jag hörde inget meddelande. {owner} ser att du har ringt. Hej då!",
        "en": "I did not catch a message. {owner} will see that you called. Goodbye!",
    },
}

_YES_WORDS = {"ja", "japp", "gärna", "yes", "yeah", "please", "sure", "ok", "okej"}


class CallPipeline:
    """Realtime plumbing for one live call leg.

    Caller audio goes to STT; committed transcripts become caller turns on the
    session (which wakes MCP long-pollers). Text from ``speak`` is synthesised and
    streamed to the telephony leg in order. Caller speech while audio is playing
    triggers barge-in. If the Grok Bot never shows up, a scripted fallback takes
    the caller's message. The pipeline never decides *what* the assistant says
    beyond these fixed operational sentences.
    """

    def __init__(
        self,
        session: CallSession,
        telephony: TelephonyLeg,
        stt: SpeechToTextPort,
        tts: TextToSpeechPort,
        owner_name: str = "Patrik",
        hold_timeout_seconds: float = 6.0,
        fallback_timeout_seconds: float = 12.0,
        speak_connecting_line: bool = False,
        barge_in_min_chars: int = 3,
        on_ended: Optional[Callable[[CallSession], Awaitable[None]]] = None,
    ):
        self.session = session
        self.telephony = telephony
        self.stt = stt
        self.tts = tts
        self.owner_name = owner_name
        self.hold_timeout_seconds = hold_timeout_seconds
        self.fallback_timeout_seconds = fallback_timeout_seconds
        self.speak_connecting_line = speak_connecting_line
        self.barge_in_min_chars = barge_in_min_chars
        self.on_ended = on_ended

        self._active = False
        self._queue: "asyncio.Queue[Tuple[str, Optional[str]]]" = asyncio.Queue()
        self._speaker_task: Optional[asyncio.Task] = None
        self._stream_task: Optional[asyncio.Task] = None
        self._idle = asyncio.Event()
        self._idle.set()
        self._generation = 0
        # Monotonic time at which 46elks will have finished playing what we sent.
        self._playback_ends_at = 0.0
        self._awaiting_first_audio = False
        self._monitor_task: Optional[asyncio.Task] = None
        self._fallback_task: Optional[asyncio.Task] = None
        self._end_lock = asyncio.Lock()

    # --------------------------------------------------------------- lifecycle

    async def start(self) -> None:
        logger.info("Pipeline starting for %s", self.session.call_id)
        self._active = True
        self.session.pipeline = self
        await self.session.set_status(CallStatus.CONNECTING)
        self.session.timings.realtime_connected_at = datetime.now(timezone.utc)

        await self.stt.start(on_partial=self.on_stt_partial, on_committed=self.on_stt_committed)
        self._speaker_task = asyncio.create_task(self._speaker_loop())
        await self.session.set_status(CallStatus.LIVE)

        if self.session.pending_speech:
            for text, lang in self.session.pending_speech:
                await self._enqueue(text, lang)
            self.session.pending_speech.clear()
        elif self.speak_connecting_line and not self.session.agent_ready:
            await self._say("connecting")

        self._monitor_task = asyncio.create_task(self._monitor_agent_arrival())

    async def hangup(self, final_words: Optional[str] = None, reason: str = "assistant_hangup") -> None:
        """End the call. Any queued speech and ``final_words`` are played first."""
        async with self._end_lock:
            if not self._active:
                return
            if final_words:
                await self._enqueue(final_words, self.session.detected_language)
            await self.session.set_status(CallStatus.ENDING)
            self._cancel_helpers()
            await self._drain(timeout=15.0)
            await self._finish(reason)

    async def on_leg_closed(self, reason: str = "caller_hangup") -> None:
        """Telephony leg went away (caller hung up or provider closed)."""
        async with self._end_lock:
            if not self._active:
                return
            self._cancel_helpers()
            await self._stop_output(send_interrupt=False)
            await self._finish(reason)

    async def _finish(self, reason: str) -> None:
        self._active = False
        self._cancel(self._speaker_task)
        try:
            await self.stt.close()
        except Exception:  # noqa: BLE001 - provider teardown must not mask hangup
            logger.exception("STT close failed")
        try:
            await self.telephony.hangup()
        except Exception:  # noqa: BLE001
            logger.exception("Telephony hangup failed")
        await self.session.set_status(CallStatus.ENDED, reason=reason)
        logger.info("Call %s ended (%s)", self.session.call_id, reason)
        if self.on_ended is not None:
            try:
                await self.on_ended(self.session)
            except Exception:  # noqa: BLE001
                logger.exception("on_ended hook failed")

    # ------------------------------------------------------------------ audio in

    async def on_caller_audio_chunk(self, chunk: bytes) -> None:
        if self._active:
            await self.stt.push_audio(chunk)

    async def on_stt_partial(self, partial_text: str) -> None:
        self.session.current_partial_transcript = partial_text
        if self.output_pending and len(partial_text.strip()) >= self.barge_in_min_chars:
            logger.info("Barge-in on partial transcript: %r", partial_text)
            await self.interrupt_playback()

    async def on_stt_committed(self, text: str, detected_lang: Optional[str] = None) -> None:
        text = text.strip()
        if not text:
            return
        logger.info("Caller turn: %r (%s)", text, detected_lang)
        if self.output_pending:
            await self.interrupt_playback()
        self._awaiting_first_audio = True
        await self.session.add_caller_turn(text, explicit_lang=detected_lang)

    # ----------------------------------------------------------------- audio out

    @property
    def is_speaking(self) -> bool:
        return self._stream_task is not None and not self._stream_task.done()

    @property
    def output_pending(self) -> bool:
        """True while we are still streaming, or 46elks still has our audio buffered."""
        return self.is_speaking or not self._queue.empty() or time.monotonic() < self._playback_ends_at

    async def speak(self, text: str, language: Optional[str] = None) -> None:
        """Agent-originated speech (MCP ``speak``). Sentences play in order."""
        self.session.mark_agent_activity()
        await self._enqueue(text, language)

    async def _say(self, key: str, **fmt: str) -> None:
        """Fixed operational sentence chosen by the gateway, not the agent."""
        lang = self.session.detected_language if self.session.detected_language in ("sv", "en") else "sv"
        text = TEXTS[key][lang].format(owner=self.owner_name, **fmt)
        await self._enqueue(text, lang)

    async def _enqueue(self, text: str, language: Optional[str]) -> None:
        await self.session.add_assistant_turn(text, language=language)
        self._idle.clear()
        await self._queue.put((text, language))

    async def _speaker_loop(self) -> None:
        try:
            while True:
                text, language = await self._queue.get()
                generation = self._generation
                self._stream_task = asyncio.create_task(self._stream_one(text, language, generation))
                try:
                    await self._stream_task
                except asyncio.CancelledError:
                    if not self._active:
                        raise
                finally:
                    self._stream_task = None
                    if self._queue.empty():
                        self._idle.set()
        except asyncio.CancelledError:
            pass

    async def _stream_one(self, text: str, language: Optional[str], generation: int) -> None:
        logger.info("Speaking: %r", text[:60])
        try:
            async for chunk in self.tts.synthesize_stream(text, language=language):
                if generation != self._generation or not self._active:
                    return
                if self._awaiting_first_audio:
                    self._awaiting_first_audio = False
                    self.session.timings.tts_first_audio_at = datetime.now(timezone.utc)
                await self.telephony.send_audio_chunk(chunk)
                now = time.monotonic()
                self._playback_ends_at = max(now, self._playback_ends_at) + len(chunk) / ULAW_BYTES_PER_SECOND
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - one failed sentence must not kill the call
            logger.exception("TTS streaming failed")

    async def interrupt_playback(self) -> None:
        """Drop queued speech, stop the current sentence and flush the provider buffer."""
        await self._stop_output(send_interrupt=True)

    async def _stop_output(self, send_interrupt: bool) -> None:
        self._generation += 1
        while not self._queue.empty():
            self._queue.get_nowait()
        was_streaming = self.is_speaking
        if was_streaming:
            self._stream_task.cancel()
            try:
                await self._stream_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        had_buffered_audio = time.monotonic() < self._playback_ends_at
        self._playback_ends_at = 0.0
        self._idle.set()
        if send_interrupt and (was_streaming or had_buffered_audio):
            await self.telephony.interrupt()

    async def _drain(self, timeout: float) -> None:
        """Wait until everything queued has been handed to the telephony leg."""
        try:
            await asyncio.wait_for(self._idle.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("Timed out draining speech for %s", self.session.call_id)

    # ------------------------------------------------- agent arrival / fallback

    def on_agent_activity(self) -> None:
        """Called by the session when the Grok Bot touches this call via MCP."""
        self._cancel(self._monitor_task)

    async def _monitor_agent_arrival(self) -> None:
        try:
            await asyncio.sleep(self.hold_timeout_seconds)
            if self.session.agent_ready or not self._active:
                return
            logger.warning("Agent absent after %.1fs; playing hold line", self.hold_timeout_seconds)
            await self._say("hold")

            await asyncio.sleep(max(0.0, self.fallback_timeout_seconds - self.hold_timeout_seconds))
            if self.session.agent_ready or not self._active:
                return
            logger.warning("Agent absent after %.1fs; engaging fallback", self.fallback_timeout_seconds)
            self.session.handled_by = "fallback"
            self._fallback_task = asyncio.create_task(self._run_fallback())
        except asyncio.CancelledError:
            pass

    async def _run_fallback(self) -> None:
        """Scripted message-taking when Grok never arrives. Deliberately narrow:
        identify as automated, collect a message and callback wish, hang up."""
        try:
            await self._say("fallback_greeting")
            after = self.session.latest_turn_number
            turn = await self.session.wait_for_turn(after_turn=after, timeout_seconds=20.0)
            if turn is None:
                if self._active:
                    await self.hangup(TEXTS["fallback_no_input"][self._lang()].format(owner=self.owner_name), reason="fallback_no_input")
                return

            message = turn.text
            await self._say("fallback_callback")
            after = self.session.latest_turn_number
            answer = await self.session.wait_for_turn(after_turn=after, timeout_seconds=10.0)
            callback = bool(answer) and any(w in answer.text.lower().split() for w in _YES_WORDS)

            await self.session.add_message(
                caller_name=None,
                message=message,
                callback_requested=callback,
                urgency="normal",
            )
            if self._active:
                await self.hangup(TEXTS["fallback_closing"][self._lang()].format(owner=self.owner_name), reason="fallback_complete")
        except asyncio.CancelledError:
            pass

    def _lang(self) -> str:
        return self.session.detected_language if self.session.detected_language in ("sv", "en") else "sv"

    def _cancel_helpers(self) -> None:
        # The fallback task may itself be the one calling hangup(); never cancel
        # the task we are running in.
        current = asyncio.current_task()
        for task in (self._monitor_task, self._fallback_task):
            if task is not current:
                self._cancel(task)

    @staticmethod
    def _cancel(task: Optional[asyncio.Task]) -> None:
        if task is not None and not task.done():
            task.cancel()
