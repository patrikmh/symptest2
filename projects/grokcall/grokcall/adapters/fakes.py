import asyncio
from typing import AsyncIterator, List, Optional, Callable, Awaitable

from grokcall.core.ports import (
    TelephonyLeg,
    SpeechToTextPort,
    TextToSpeechPort,
    WakeNotifierPort,
)


class FakeTelephonyLeg(TelephonyLeg):
    """In-memory fake telephony leg for testing."""

    def __init__(self):
        self.sent_chunks: List[bytes] = []
        self.interrupted_count: int = 0
        self.hungup: bool = False

    async def send_audio_chunk(self, chunk: bytes) -> None:
        self.sent_chunks.append(chunk)

    async def interrupt(self) -> None:
        self.interrupted_count += 1

    async def hangup(self) -> None:
        self.hungup = True


class FakeSTT(SpeechToTextPort):
    """In-memory fake STT for simulating caller speech."""

    def __init__(self):
        self.pushed_audio: List[bytes] = []
        self._on_partial: Optional[Callable[[str], Awaitable[None]]] = None
        self._on_committed: Optional[Callable[[str, Optional[str]], Awaitable[None]]] = None
        self.is_open: bool = False

    async def start(
        self,
        on_partial: Callable[[str], Awaitable[None]],
        on_committed: Callable[[str, Optional[str]], Awaitable[None]],
    ) -> None:
        self._on_partial = on_partial
        self._on_committed = on_committed
        self.is_open = True

    async def push_audio(self, chunk: bytes) -> None:
        self.pushed_audio.append(chunk)

    async def simulate_partial(self, text: str) -> None:
        if self._on_partial:
            await self._on_partial(text)

    async def simulate_committed(self, text: str, lang: Optional[str] = None) -> None:
        if self._on_committed:
            await self._on_committed(text, lang)

    async def close(self) -> None:
        self.is_open = False


class FakeTTS(TextToSpeechPort):
    """In-memory fake TTS yielding dummy audio packets."""

    def __init__(self, delay_per_chunk: float = 0.01):
        self.synthesized_texts: List[str] = []
        self.delay_per_chunk = delay_per_chunk

    async def synthesize_stream(
        self,
        text: str,
        language: Optional[str] = None,
    ) -> AsyncIterator[bytes]:
        self.synthesized_texts.append(text)
        # Yield 3 fake 160-byte μ-law chunks
        for _ in range(3):
            if self.delay_per_chunk > 0:
                await asyncio.sleep(self.delay_per_chunk)
            yield b"\xff" * 160


class FakeWakeNotifier(WakeNotifierPort):
    """In-memory fake wake notifier for testing."""

    def __init__(self):
        self.notified_calls: List[str] = []

    async def notify_call_started(
        self,
        call_id: str,
        caller: str,
        called: str,
    ) -> bool:
        self.notified_calls.append(call_id)
        return True
