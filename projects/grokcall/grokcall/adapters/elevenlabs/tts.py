import logging
from typing import AsyncIterator, Optional

import httpx

from grokcall.core.ports import TextToSpeechPort

logger = logging.getLogger("grokcall.elevenlabs.tts")

# 40 ms of G.711 mu-law at 8 kHz per WebSocket message keeps the provider buffer
# fine-grained enough for snappy barge-in without flooding the socket.
CHUNK_BYTES = 320


class ElevenLabsFlashTTS(TextToSpeechPort):
    """ElevenLabs low-latency multilingual TTS, streamed as G.711 mu-law 8 kHz so the
    bytes can be forwarded to the telephony leg without transcoding."""

    def __init__(
        self,
        api_key: str,
        voice_id: str,
        model_id: str = "eleven_flash_v2_5",
        base_url: str = "https://api.elevenlabs.io/v1/text-to-speech",
        client: Optional[httpx.AsyncClient] = None,
        stability: float = 0.4,
        similarity_boost: float = 0.85,
        style: float = 0.2,
        use_speaker_boost: bool = True,
        speed: float = 0.95,
    ):
        self.api_key = api_key
        self.voice_id = voice_id
        self.model_id = model_id
        self.base_url = base_url
        self._client = client or httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0))
        self.stability = stability
        self.similarity_boost = similarity_boost
        self.style = style
        self.use_speaker_boost = use_speaker_boost
        self.speed = speed

    def build_payload(self, text: str, language: Optional[str] = None) -> dict:
        payload = {
            "text": text,
            "model_id": self.model_id,
            "voice_settings": {
                "stability": self.stability,
                "similarity_boost": self.similarity_boost,
                "style": self.style,
                "use_speaker_boost": self.use_speaker_boost,
                "speed": self.speed,
            },
        }
        if language in ("sv", "en"):
            payload["language_code"] = language
        return payload

    async def synthesize_stream(self, text: str, language: Optional[str] = None) -> AsyncIterator[bytes]:
        url = f"{self.base_url}/{self.voice_id}/stream"
        payload = self.build_payload(text, language=language)
        if language in ("sv", "en"):
            payload["language_code"] = language

        logger.info("TTS %d chars (%s)", len(text), language)
        try:
            async with self._client.stream(
                "POST",
                url,
                params={"output_format": "ulaw_8000"},
                headers={"xi-api-key": self.api_key, "Content-Type": "application/json"},
                json=payload,
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    logger.error("ElevenLabs TTS %s: %s", response.status_code, body[:300])
                    return
                async for chunk in response.aiter_bytes(chunk_size=CHUNK_BYTES):
                    if chunk:
                        yield chunk
        except httpx.HTTPError as exc:
            logger.error("ElevenLabs TTS request failed: %s", exc)

    async def aclose(self) -> None:
        await self._client.aclose()
