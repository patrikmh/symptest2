import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import uuid

from grokcall.core.models import (
    CallStatus,
    Speaker,
    CallTurn,
    CallMessage,
    CallTimings,
)
from grokcall.core.language import detect_language


class CallSession:
    """Live state for an active telephone call."""

    def __init__(
        self,
        call_id: str,
        caller: str,
        called: str,
        provider_call_id: Optional[str] = None,
        default_language: str = "sv",
    ):
        self.call_id = call_id
        self.caller = caller
        self.called = called
        self.provider_call_id = provider_call_id
        self.status: CallStatus = CallStatus.WAITING
        self.detected_language: str = default_language
        self.summary: Optional[str] = None

        self.turns: List[CallTurn] = []
        self.messages: List[CallMessage] = []
        self.current_partial_transcript: str = ""

        self.started_at: datetime = datetime.now(timezone.utc)
        self.ended_at: Optional[datetime] = None
        self.timings: CallTimings = CallTimings(incoming_webhook_at=self.started_at)

        # Async coordination primitives
        self._turn_events: List[asyncio.Event] = []
        self._status_events: List[asyncio.Event] = []
        self._lock = asyncio.Lock()

        # Telephony / Pipeline connection handle
        self.pipeline: Any = None

    async def set_status(self, new_status: CallStatus) -> None:
        async with self._lock:
            self.status = new_status
            if new_status in (CallStatus.ENDED, CallStatus.FAILED) and not self.ended_at:
                self.ended_at = datetime.now(timezone.utc)
                self.timings.call_ended_at = self.ended_at

            # Notify any listeners waiting for status changes
            for evt in self._status_events:
                evt.set()

    async def add_caller_turn(self, text: str, explicit_lang: Optional[str] = None) -> CallTurn:
        async with self._lock:
            lang = explicit_lang or detect_language(text, default=self.detected_language)
            self.detected_language = lang
            turn_number = len(self.turns) + 1
            turn = CallTurn(
                turn_number=turn_number,
                speaker=Speaker.CALLER,
                text=text,
                language=lang,
            )
            self.turns.append(turn)
            self.current_partial_transcript = ""
            self.timings.caller_turn_committed_at = datetime.now(timezone.utc)

            # Notify listeners waiting for a turn
            for evt in self._turn_events:
                evt.set()
            return turn

    async def add_assistant_turn(self, text: str, language: Optional[str] = None) -> CallTurn:
        async with self._lock:
            lang = language or self.detected_language
            turn_number = len(self.turns) + 1
            turn = CallTurn(
                turn_number=turn_number,
                speaker=Speaker.ASSISTANT,
                text=text,
                language=lang,
            )
            self.turns.append(turn)
            self.timings.grok_response_received_at = datetime.now(timezone.utc)
            return turn

    async def add_message(
        self,
        caller_name: Optional[str],
        message: str,
        callback_requested: bool = True,
        urgency: str = "normal",
    ) -> CallMessage:
        async with self._lock:
            msg = CallMessage(
                caller_name=caller_name,
                message=message,
                callback_requested=callback_requested,
                urgency=urgency,
            )
            self.messages.append(msg)
            return msg

    async def wait_for_turn(self, after_turn: int, timeout_seconds: float) -> Optional[CallTurn]:
        """Long-poll until a turn with turn_number > after_turn is available, or timeout."""
        # Fast path if already present
        async with self._lock:
            for turn in self.turns:
                if turn.turn_number > after_turn and turn.speaker == Speaker.CALLER:
                    return turn
            if self.status in (CallStatus.ENDED, CallStatus.FAILED):
                return None

        event = asyncio.Event()
        self._turn_events.append(event)
        try:
            start_time = asyncio.get_event_loop().time()
            while True:
                elapsed = asyncio.get_event_loop().time() - start_time
                remaining = timeout_seconds - elapsed
                if remaining <= 0:
                    return None

                try:
                    await asyncio.wait_for(event.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    return None

                async with self._lock:
                    for turn in self.turns:
                        if turn.turn_number > after_turn and turn.speaker == Speaker.CALLER:
                            return turn
                    if self.status in (CallStatus.ENDED, CallStatus.FAILED):
                        return None
                event.clear()
        finally:
            if event in self._turn_events:
                self._turn_events.remove(event)

    async def wait_for_live(self, timeout_seconds: float) -> bool:
        """Wait until call is in LIVE status."""
        if self.status == CallStatus.LIVE:
            return True
        if self.status in (CallStatus.ENDED, CallStatus.FAILED):
            return False

        event = asyncio.Event()
        self._status_events.append(event)
        try:
            start_time = asyncio.get_event_loop().time()
            while True:
                if self.status == CallStatus.LIVE:
                    return True
                if self.status in (CallStatus.ENDED, CallStatus.FAILED):
                    return False

                elapsed = asyncio.get_event_loop().time() - start_time
                remaining = timeout_seconds - elapsed
                if remaining <= 0:
                    return self.status == CallStatus.LIVE

                try:
                    await asyncio.wait_for(event.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    return self.status == CallStatus.LIVE
                event.clear()
        finally:
            if event in self._status_events:
                self._status_events.remove(event)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "call_id": self.call_id,
            "provider_call_id": self.provider_call_id,
            "caller": self.caller,
            "called": self.called,
            "status": self.status.value,
            "language": self.detected_language,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "summary": self.summary,
            "turns": [turn.model_dump() for turn in self.turns],
            "messages": [msg.model_dump() for msg in self.messages],
            "current_partial_transcript": self.current_partial_transcript,
            "timings": self.timings.model_dump(),
            "latencies_ms": self.timings.compute_latencies(),
        }


class CallRegistry:
    """Thread/async-safe registry for managing call sessions."""

    def __init__(self):
        self._sessions: Dict[str, CallSession] = {}
        self._provider_map: Dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def create_session(
        self,
        caller: str,
        called: str,
        provider_call_id: Optional[str] = None,
        call_id: Optional[str] = None,
    ) -> CallSession:
        async with self._lock:
            cid = call_id or f"call_{uuid.uuid4().hex[:12]}"
            session = CallSession(
                call_id=cid,
                caller=caller,
                called=called,
                provider_call_id=provider_call_id,
            )
            self._sessions[cid] = session
            if provider_call_id:
                self._provider_map[provider_call_id] = cid
            return session

    async def get_by_id(self, call_id: str) -> Optional[CallSession]:
        async with self._lock:
            return self._sessions.get(call_id)

    async def get_by_provider_id(self, provider_call_id: str) -> Optional[CallSession]:
        async with self._lock:
            cid = self._provider_map.get(provider_call_id)
            if cid:
                return self._sessions.get(cid)
            return None

    async def list_active(self) -> List[CallSession]:
        async with self._lock:
            return [
                s for s in self._sessions.values()
                if s.status not in (CallStatus.ENDED, CallStatus.FAILED)
            ]

    async def list_all(self) -> List[CallSession]:
        async with self._lock:
            return list(self._sessions.values())


# Global singleton instance
registry = CallRegistry()
