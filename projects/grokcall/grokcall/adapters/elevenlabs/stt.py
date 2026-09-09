import asyncio
import json
import base64
import logging
from typing import Optional, Callable, Awaitable
import websockets

from grokcall.core.ports import SpeechToTextPort

logger = logging.getLogger("grokcall.elevenlabs.stt")


class ElevenLabsScribeSTT(SpeechToTextPort):
    """ElevenLabs Realtime Scribe Speech-to-Text WebSocket adapter.

    Connects to wss://api.elevenlabs.io/v1/speech-to-text/realtime with:
    - audio_format=ulaw_8000
    - commit_strategy=vad
    - language_code=sv (with secondary_languages=['en'])
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
        sample_rate: int = 8000,
        vad_silence_threshold_secs: float = 0.7,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.sample_rate = sample_rate
        self.vad_silence_threshold_secs = vad_silence_threshold_secs

        self._ws = None
        self._rx_task: Optional[asyncio.Task] = None
        self._is_running = False

    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_committed: Callable[[str, Optional[str]], Awaitable[None]],
    ) -> None:
        params = [
            ("audio_format", "ulaw_8000"),
            ("commit_strategy", "vad"),
            ("vad_silence_threshold_secs", str(self.vad_silence_threshold_secs)),
            ("language_code", "sv"),
            ("secondary_languages", "en"),
            ("include_language_detection", "true"),
        ]
        query_string = "&".join(f"{k}={v}" for k, v in params)
        url = f"{self.base_url}?{query_string}"

        headers = {
            "xi-api-key": self.api_key,
        }

        logger.info(f"Connecting to ElevenLabs STT: {url}")
        self._ws = await websockets.connect(url, extra_headers=headers)
        self._is_running = True

        self._rx_task = asyncio.create_task(self._receive_loop(on_partial, on_committed))

    async def _receive_loop(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_committed: Callable[[str, Optional[str]], Awaitable[None]],
    ) -> None:
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                msg_type = msg.get("message_type")

                if msg_type == "partial_transcript":
                    text = msg.get("text", "").strip()
                    if text:
                        await on_partial(text)

                elif msg_type in ("committed_transcript", "committed_transcript_with_timestamps"):
                    text = msg.get("text", "").strip()
                    lang = msg.get("language_code")
                    if text:
                        await on_committed(text, lang)

                elif msg_type == "session_started":
                    logger.info("ElevenLabs STT session started.")

                elif msg_type in ("error", "auth_error", "quota_exceeded"):
                    logger.error(f"ElevenLabs STT error: {msg}")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"ElevenLabs STT receive loop terminated: {e}")
        finally:
            self._is_running = False

    async def push_audio(self, chunk: bytes) -> None:
        if not self._is_running or not self._ws:
            return

        b64 = base64.b64encode(chunk).decode("ascii")
        msg = {
            "message_type": "input_audio_chunk",
            "audio_base_64": b64,
            "commit": False,
            "sample_rate": self.sample_rate,
        }
        await self._ws.send(json.dumps(msg))

    async def close(self) -> None:
        self._is_running = False
        if self._rx_task:
            self._rx_task.cancel()
        if self._ws:
            await self._ws.close()
