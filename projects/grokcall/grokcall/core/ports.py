from typing import Protocol, AsyncIterator, Optional, Callable, Awaitable
from abc import abstractmethod


class TelephonyLeg(Protocol):
    """Protocol for a live telephony leg (e.g. 46elks Realtime WebSocket)."""

    @abstractmethod
    async def send_audio_chunk(self, chunk: bytes) -> None:
        """Send raw μ-law 8000 Hz audio bytes to caller."""
        ...

    @abstractmethod
    async def interrupt(self) -> None:
        """Tell telephony gateway to clear audio buffer and stop playing."""
        ...

    @abstractmethod
    async def hangup(self) -> None:
        """Terminate telephone call cleanly."""
        ...


class SpeechToTextPort(Protocol):
    """Protocol for streaming STT engine (e.g. ElevenLabs Scribe)."""

    @abstractmethod
    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_committed: Callable[[str, Optional[str]], Awaitable[None]],
    ) -> None:
        ...

    @abstractmethod
    async def push_audio(self, chunk: bytes) -> None:
        ...

    @abstractmethod
    async def close(self) -> None:
        ...


class TextToSpeechPort(Protocol):
    """Protocol for streaming TTS engine (e.g. ElevenLabs Flash)."""

    @abstractmethod
    async def synthesize_stream(
        self,
        text: str,
        language: Optional[str] = None,
    ) -> AsyncIterator[bytes]:
        """Yields raw μ-law 8000 Hz audio chunks."""
        ...


class WakeNotifierPort(Protocol):
    """Protocol for waking the Grok Bot (e.g. Slack webhook)."""

    @abstractmethod
    async def notify_call_started(
        self,
        call_id: str,
        caller: str,
        called: str,
    ) -> bool:
        ...
