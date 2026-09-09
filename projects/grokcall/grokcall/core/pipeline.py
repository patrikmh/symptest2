import asyncio
import logging
from typing import Optional
from datetime import datetime, timezone

from grokcall.core.models import CallStatus, Speaker
from grokcall.core.registry import CallSession
from grokcall.core.ports import TelephonyLeg, SpeechToTextPort, TextToSpeechPort

logger = logging.getLogger("grokcall.pipeline")


class CallPipeline:
    """Manages audio bidirectional flow, speech recognition, speech synthesis,

    and caller interruption (barge-in) for a single live call leg.
    """

    def __init__(
        self,
        session: CallSession,
        telephony: TelephonyLeg,
        stt: SpeechToTextPort,
        tts: TextToSpeechPort,
        hold_timeout_seconds: float = 6.0,
        fallback_timeout_seconds: float = 12.0,
    ):
        self.session = session
        self.telephony = telephony
        self.stt = stt
        self.tts = tts
        self.hold_timeout_seconds = hold_timeout_seconds
        self.fallback_timeout_seconds = fallback_timeout_seconds

        self._is_active = True
        self._current_speak_task: Optional[asyncio.Task] = None
        self._is_assistant_speaking = False
        self._first_audio_sent = False
        self._grok_interacted = False
        self._fallback_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start the STT listener and connect the session."""
        logger.info(f"Starting CallPipeline for session {self.session.call_id}")
        await self.session.set_status(CallStatus.LIVE)
        self.session.timings.realtime_connected_at = datetime.now(timezone.utc)
        self.session.pipeline = self

        await self.stt.start(
            on_partial=self.on_stt_partial,
            on_committed=self.on_stt_committed,
        )

        # Start wake timeout watcher for hold audio / fallback
        self._fallback_task = asyncio.create_task(self._monitor_grok_wake())

    async def on_caller_audio_chunk(self, chunk: bytes) -> None:
        """Forward audio from 46elks to ElevenLabs STT."""
        if not self._is_active:
            return
        await self.stt.push_audio(chunk)

    async def on_stt_partial(self, partial_text: str) -> None:
        """Called on partial transcript from ElevenLabs Scribe."""
        self.session.current_partial_transcript = partial_text
        # Barge-in: if the caller begins speaking while assistant is playing audio,
        # interrupt output playback immediately!
        if self._is_assistant_speaking and len(partial_text.strip()) > 2:
            logger.info(f"Barge-in triggered by partial caller speech: '{partial_text}'")
            await self.interrupt_playback()

    async def on_stt_committed(self, text: str, detected_lang: Optional[str] = None) -> None:
        """Called when a finalized utterance turn is committed by ElevenLabs Scribe."""
        logger.info(f"Caller committed turn: '{text}' (lang: {detected_lang})")
        # Ensure any leftover assistant speech is cancelled
        if self._is_assistant_speaking:
            await self.interrupt_playback()

        await self.session.add_caller_turn(text, explicit_lang=detected_lang)

    async def speak(self, text: str, language: Optional[str] = None) -> None:
        """Called by Grok Bot via MCP speak tool."""
        self._grok_interacted = True
        if self._fallback_task and not self._fallback_task.done():
            self._fallback_task.cancel()

        # Record assistant turn in history
        await self.session.add_assistant_turn(text, language=language)

        # Cancel any current in-flight speech if already speaking
        if self._is_assistant_speaking:
            await self.interrupt_playback()

        # Start streaming speech
        self._current_speak_task = asyncio.create_task(self._stream_speech(text, language))

    async def _stream_speech(self, text: str, language: Optional[str] = None) -> None:
        try:
            self._is_assistant_speaking = True
            logger.info(f"Synthesizing and streaming speech: '{text[:40]}...'")

            async for chunk in self.tts.synthesize_stream(text, language=language):
                if not self._is_assistant_speaking or not self._is_active:
                    break

                if not self._first_audio_sent:
                    self._first_audio_sent = True
                    self.session.timings.tts_first_audio_at = datetime.now(timezone.utc)

                await self.telephony.send_audio_chunk(chunk)

        except asyncio.CancelledError:
            logger.info("Speech streaming task cancelled.")
        except Exception as e:
            logger.error(f"Error streaming speech to caller: {e}")
        finally:
            self._is_assistant_speaking = False

    async def interrupt_playback(self) -> None:
        """Halt assistant output playback and flush 46elks buffer."""
        self._is_assistant_speaking = False
        if self._current_speak_task and not self._current_speak_task.done():
            self._current_speak_task.cancel()
            self._current_speak_task = None
        await self.telephony.interrupt()

    async def _monitor_grok_wake(self) -> None:
        """Ensure caller is never left in silence if Grok takes time to wake."""
        try:
            # Wait for initial hold threshold
            await asyncio.sleep(self.hold_timeout_seconds)
            if self._grok_interacted or not self._is_active:
                return

            logger.warning(f"Grok has not interacted after {self.hold_timeout_seconds}s. Playing hold prompt.")
            hold_msg = (
                "Ett ögonblick så kopplar jag dig till Patriks AI-assistent."
                if self.session.detected_language == "sv"
                else "Just a moment while I connect you to Patrik's AI assistant."
            )
            await self.speak(hold_msg, language=self.session.detected_language)

            # Wait for hard fallback threshold
            remaining = max(1.0, self.fallback_timeout_seconds - self.hold_timeout_seconds)
            await asyncio.sleep(remaining)
            if self._grok_interacted or not self._is_active:
                return

            logger.warning(f"Grok failed to take over within {self.fallback_timeout_seconds}s. Engaging fallback assistant.")
            await self._run_fallback_assistant()

        except asyncio.CancelledError:
            pass

    async def _run_fallback_assistant(self) -> None:
        """Deterministic fallback assistant when Grok Bot does not awaken."""
        fallback_greeting = (
            "Hej! Patrik kan inte svara just nu. Detta är en automatisk röstassistent. "
            "Säg gärna ditt namn och ett kort meddelande efter signalen så ser jag till att han får det."
            if self.session.detected_language == "sv"
            else "Hi! Patrik cannot answer right now. This is an automated assistant. "
            "Please state your name and a brief message and I will make sure he gets it."
        )
        await self.speak(fallback_greeting, language=self.session.detected_language)
        # Wait up to 10 seconds for a caller turn
        turn = await self.session.wait_for_turn(after_turn=len(self.session.turns), timeout_seconds=10.0)
        if turn:
            await self.session.add_message(
                caller_name="Caller",
                message=turn.text,
                callback_requested=True,
                urgency="normal",
            )
            closing = (
                "Tack, jag har sparat ditt meddelande. Hej då!"
                if self.session.detected_language == "sv"
                else "Thank you, I have saved your message. Goodbye!"
            )
            await self.speak(closing, language=self.session.detected_language)
            await asyncio.sleep(2.0)

        await self.hangup()

    async def hangup(self, final_words: Optional[str] = None) -> None:
        """Terminate call cleanly."""
        if not self._is_active:
            return

        if final_words:
            await self.speak(final_words, language=self.session.detected_language)
            if self._current_speak_task:
                try:
                    await asyncio.wait_for(self._current_speak_task, timeout=4.0)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass

        self._is_active = False
        if self._fallback_task and not self._fallback_task.done():
            self._fallback_task.cancel()

        await self.interrupt_playback()
        await self.stt.close()
        await self.telephony.hangup()
        await self.session.set_status(CallStatus.ENDED)
        logger.info(f"Call {self.session.call_id} ended.")
