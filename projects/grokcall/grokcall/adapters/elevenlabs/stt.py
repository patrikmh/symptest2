import asyncio
import base64
import json
import logging
from typing import Awaitable, Callable, List, Optional
from urllib.parse import urlencode

import websockets

from grokcall.core.ports import SpeechToTextPort

logger = logging.getLogger("grokcall.elevenlabs.stt")

_FATAL_MESSAGE_TYPES = {
    "error", "auth_error", "quota_exceeded", "unaccepted_terms", "rate_limited",
    "queue_overflow", "resource_exhausted", "session_time_limit_exceeded",
    "invalid_request", "transcriber_error",
}


class ElevenLabsScribeSTT(SpeechToTextPort):
    """ElevenLabs Scribe realtime speech-to-text over WebSocket.

    Audio is forwarded as-is in G.711 mu-law 8 kHz (``audio_format=ulaw_8000``) and
    turns are committed by the service's voice-activity detection. Language is
    auto-detected unless a primary language is configured; ``committed_transcript``
    events then carry ``language_code``.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
        model_id: str = "scribe_v2_realtime",
        language_code: Optional[str] = None,
        secondary_languages: Optional[List[str]] = None,
        vad_silence_threshold_secs: float = 0.7,
        sample_rate: int = 8000,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.model_id = model_id
        self.language_code = language_code
        self.secondary_languages = secondary_languages or []
        self.vad_silence_threshold_secs = vad_silence_threshold_secs
        self.sample_rate = sample_rate

        self._ws: Optional[websockets.ClientConnection] = None
        self._rx_task: Optional[asyncio.Task] = None
        self._running = False

    def build_url(self) -> str:
        params = [
            ("model_id", self.model_id),
            ("audio_format", "ulaw_8000"),
            ("commit_strategy", "vad"),
            ("vad_silence_threshold_secs", f"{self.vad_silence_threshold_secs:g}"),
            ("include_language_detection", "true"),
            # language_code is only present on committed_transcript_with_timestamps
            ("include_timestamps", "true"),
        ]
        if self.language_code:
            params.append(("language_code", self.language_code))
            for lang in self.secondary_languages:
                params.append(("secondary_languages", lang))
        return f"{self.base_url}?{urlencode(params)}"

    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_committed: Callable[[str, Optional[str]], Awaitable[None]],
    ) -> None:
        url = self.build_url()
        logger.info("Connecting to ElevenLabs STT")
        self._ws = await websockets.connect(
            url,
            additional_headers={"xi-api-key": self.api_key},
            open_timeout=10,
            ping_interval=20,
        )
        self._running = True
        self._rx_task = asyncio.create_task(self._receive_loop(on_partial, on_committed))

    async def _receive_loop(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_committed: Callable[[str, Optional[str]], Awaitable[None]],
    ) -> None:
        assert self._ws is not None
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                kind = msg.get("message_type")

                if kind == "partial_transcript":
                    text = (msg.get("text") or "").strip()
                    if text:
                        await on_partial(text)

                elif kind in ("committed_transcript", "committed_transcript_with_timestamps"):
                    text = (msg.get("text") or "").strip()
                    if text:
                        await on_committed(text, msg.get("language_code"))

                elif kind == "session_started":
                    logger.info("ElevenLabs STT session %s started", msg.get("session_id"))

                elif kind == "warning":
                    logger.warning("ElevenLabs STT warning: %s", msg.get("warning"))

                elif kind in _FATAL_MESSAGE_TYPES:
                    logger.error("ElevenLabs STT %s: %s", kind, msg.get("error"))

        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001 - network teardown of any kind
            logger.warning("ElevenLabs STT receive loop ended: %s", exc)
        finally:
            self._running = False

    async def push_audio(self, chunk: bytes) -> None:
        if not self._running or self._ws is None:
            return
        try:
            await self._ws.send(json.dumps({
                "message_type": "input_audio_chunk",
                "audio_base_64": base64.b64encode(chunk).decode("ascii"),
                "commit": False,
                "sample_rate": self.sample_rate,
            }))
        except websockets.ConnectionClosed:
            self._running = False

    async def close(self) -> None:
        self._running = False
        if self._rx_task is not None:
            self._rx_task.cancel()
            try:
                await self._rx_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        if self._ws is not None:
            await self._ws.close()
