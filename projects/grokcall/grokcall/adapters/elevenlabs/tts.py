import httpx
import logging
from typing import AsyncIterator, Optional

from grokcall.core.ports import TextToSpeechPort

logger = logging.getLogger("grokcall.elevenlabs.tts")


class ElevenLabsFlashTTS(TextToSpeechPort):
    """ElevenLabs Flash Multilingual low-latency streaming TTS adapter.

    Queries POST /v1/text-to-speech/{voice_id}/stream?output_format=ulaw_8000
    Yields raw G.711 μ-law bytes directly for 46elks.
    """

    def __init__(
        self,
        api_key: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",
        model_id: str = "eleven_flash_v2_5",
        base_url: str = "https://api.elevenlabs.io/v1/text-to-speech",
    ):
        self.api_key = api_key
        self.voice_id = voice_id
        self.model_id = model_id
        self.base_url = base_url

    async def synthesize_stream(
        self,
        text: str,
        language: Optional[str] = None,
    ) -> AsyncIterator[bytes]:
        url = f"{self.base_url}/{self.voice_id}/stream"
        params = {
            "output_format": "ulaw_8000",
        }
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "audio/basic",
        }
        payload = {
            "text": text,
            "model_id": self.model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }

        # If language code is given, pass language_code in payload if supported
        if language in ("sv", "en"):
            payload["language_code"] = language

        logger.info(f"Synthesizing TTS via ElevenLabs for {len(text)} chars (lang: {language})")

        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("POST", url, params=params, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    logger.error(f"ElevenLabs TTS error {response.status_code}: {err_body}")
                    return

                async for chunk in response.aiter_bytes(chunk_size=320):  # 40ms frame @ 8kHz μ-law
                    if chunk:
                        yield chunk
