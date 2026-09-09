import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from grokcall.core.language import detect_language, normalize_language
from grokcall.core.models import (
    CallMessage,
    CallStatus,
    CallTimings,
    CallTurn,
    Speaker,
)

TERMINAL_STATUSES = (CallStatus.ENDED, CallStatus.FAILED)
PENDING_STATUSES = (
    CallStatus.RINGING,
    CallStatus.WAITING,
    CallStatus.WAKING_AGENT,
    CallStatus.CONNECTING,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CallSession:
    """Live state for one telephone call.

    All mutation goes through async methods so that MCP long-pollers and the audio
    pipeline can observe changes through the same event primitives.
    """

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
        # The realtime leg is a separate 46elks call leg with its own id.
        self.realtime_call_id: Optional[str] = None
        self.status: CallStatus = CallStatus.WAITING
        self.detected_language: str = default_language
        self.summary: Optional[str] = None
        self.end_reason: Optional[str] = None
        # "grok" once the agent has made any MCP call for this session, "fallback" if
        # the scripted assistant had to take over.
        self.handled_by: Optional[str] = None

        self.turns: List[CallTurn] = []
        self.messages: List[CallMessage] = []
        self.current_partial_transcript: str = ""
        # speak() calls made before the audio leg exists are played on connect.
        self.pending_speech: List[Tuple[str, Optional[str]]] = []

        self.started_at: datetime = _now()
        self.ended_at: Optional[datetime] = None
        self.timings: CallTimings = CallTimings(incoming_webhook_at=self.started_at)

        self._turn_events: List[asyncio.Event] = []
        self._status_events: List[asyncio.Event] = []
        self._lock = asyncio.Lock()

        self.pipeline: Any = None

    # ------------------------------------------------------------------ status

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    @property
    def agent_ready(self) -> bool:
        return self.timings.grok_first_mcp_call_at is not None

    async def set_status(self, new_status: CallStatus, reason: Optional[str] = None) -> None:
        async with self._lock:
            if self.is_terminal:
                return
            self.status = new_status
            if new_status in TERMINAL_STATUSES:
                self.ended_at = _now()
                self.timings.call_ended_at = self.ended_at
                self.end_reason = reason
                # Release MCP long-pollers so they see call_ended immediately.
                for evt in self._turn_events:
                    evt.set()
            for evt in self._status_events:
                evt.set()

    def mark_agent_activity(self) -> None:
        """Record that the Grok Bot has reached this call through MCP."""
        if self.timings.grok_first_mcp_call_at is None:
            self.timings.grok_first_mcp_call_at = _now()
        if self.handled_by is None:
            self.handled_by = "grok"
        if self.pipeline is not None:
            self.pipeline.on_agent_activity()

    # ------------------------------------------------------------- transcript

    async def add_caller_turn(self, text: str, explicit_lang: Optional[str] = None) -> CallTurn:
        async with self._lock:
            lang = normalize_language(explicit_lang) or detect_language(
                text, default=self.detected_language
            )
            self.detected_language = lang
            turn = CallTurn(
                turn_number=len(self.turns) + 1,
                speaker=Speaker.CALLER,
                text=text,
                language=lang,
            )
            self.turns.append(turn)
            self.current_partial_transcript = ""
            self.timings.caller_turn_committed_at = turn.created_at
            # Per-turn latency markers restart with each caller turn.
            self.timings.grok_response_received_at = None
            self.timings.tts_first_audio_at = None
            for evt in self._turn_events:
                evt.set()
            return turn

    async def add_assistant_turn(self, text: str, language: Optional[str] = None) -> CallTurn:
        async with self._lock:
            turn = CallTurn(
                turn_number=len(self.turns) + 1,
                speaker=Speaker.ASSISTANT,
                text=text,
                language=normalize_language(language) or self.detected_language,
            )
            self.turns.append(turn)
            if self.timings.grok_response_received_at is None:
                self.timings.grok_response_received_at = turn.created_at
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

    @property
    def latest_turn_number(self) -> int:
        return self.turns[-1].turn_number if self.turns else 0

    def _next_caller_turn(self, after_turn: int) -> Optional[CallTurn]:
        for turn in self.turns:
            if turn.turn_number > after_turn and turn.speaker == Speaker.CALLER:
                return turn
        return None

    # ---------------------------------------------------------------- waiting

    async def wait_for_turn(self, after_turn: int, timeout_seconds: float) -> Optional[CallTurn]:
        """Block until a caller turn newer than ``after_turn`` exists, the call ends,
        or the timeout elapses. Returns None in the latter two cases; check
        ``is_terminal`` to tell them apart.
        """
        turn = self._next_caller_turn(after_turn)
        if turn or self.is_terminal:
            return turn

        event = asyncio.Event()
        self._turn_events.append(event)
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_seconds
        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    return None
                try:
                    await asyncio.wait_for(event.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    return None
                event.clear()
                turn = self._next_caller_turn(after_turn)
                if turn or self.is_terminal:
                    return turn
        finally:
            self._turn_events.remove(event)

    async def wait_for_status(self, wanted: CallStatus, timeout_seconds: float) -> bool:
        if self.status == wanted:
            return True
        if self.is_terminal:
            return False

        event = asyncio.Event()
        self._status_events.append(event)
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_seconds
        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    return self.status == wanted
                try:
                    await asyncio.wait_for(event.wait(), timeout=remaining)
                except asyncio.TimeoutError:
                    return self.status == wanted
                event.clear()
                if self.status == wanted:
                    return True
                if self.is_terminal:
                    return False
        finally:
            self._status_events.remove(event)

    async def wait_for_live(self, timeout_seconds: float) -> bool:
        return await self.wait_for_status(CallStatus.LIVE, timeout_seconds)

    # ------------------------------------------------------------ serialising

    def to_dict(self) -> Dict[str, Any]:
        return {
            "call_id": self.call_id,
            "provider_call_id": self.provider_call_id,
            "realtime_call_id": self.realtime_call_id,
            "caller": self.caller,
            "called": self.called,
            "status": self.status.value,
            "handled_by": self.handled_by,
            "language": self.detected_language,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "end_reason": self.end_reason,
            "summary": self.summary,
            "latest_turn": self.latest_turn_number,
            "turns": [turn.model_dump(mode="json") for turn in self.turns],
            "messages": [msg.model_dump(mode="json") for msg in self.messages],
            "current_partial_transcript": self.current_partial_transcript,
            "timings": self.timings.model_dump(mode="json"),
            "latencies_ms": self.timings.compute_latencies(),
        }


class CallRegistry:
    """In-memory index of call sessions, keyed by logical call id and by the
    provider's call-leg ids."""

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
        default_language: str = "sv",
    ) -> CallSession:
        async with self._lock:
            cid = call_id or f"call_{uuid.uuid4().hex[:12]}"
            session = CallSession(
                call_id=cid,
                caller=caller,
                called=called,
                provider_call_id=provider_call_id,
                default_language=default_language,
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
            return self._sessions.get(cid) if cid else None

    async def bind_realtime_leg(
        self, realtime_call_id: str, caller: str, called: str, default_language: str = "sv"
    ) -> Tuple[CallSession, bool]:
        """Attach an incoming realtime WebSocket leg to the session created by the
        incoming-call webhook.

        46elks gives the connected leg its own call id, so matching falls back from
        exact id, to the caller number among pending sessions, to the single
        pending session, and finally to a brand-new session (for calls placed
        directly to the WebSocket number). Returns (session, created).
        """
        async with self._lock:
            cid = self._provider_map.get(realtime_call_id)
            if cid and cid in self._sessions:
                session = self._sessions[cid]
                session.realtime_call_id = realtime_call_id
                return session, False

            pending = [
                s for s in self._sessions.values()
                if s.status in PENDING_STATUSES and s.realtime_call_id is None
            ]
            pending.sort(key=lambda s: s.started_at, reverse=True)

            match = next((s for s in pending if s.caller == caller), None)
            if match is None and len(pending) == 1:
                match = pending[0]

            if match is not None:
                match.realtime_call_id = realtime_call_id
                self._provider_map[realtime_call_id] = match.call_id
                return match, False

            session = CallSession(
                call_id=f"call_{uuid.uuid4().hex[:12]}",
                caller=caller,
                called=called,
                provider_call_id=realtime_call_id,
                default_language=default_language,
            )
            session.realtime_call_id = realtime_call_id
            self._sessions[session.call_id] = session
            self._provider_map[realtime_call_id] = session.call_id
            return session, True

    async def list_active(self) -> List[CallSession]:
        async with self._lock:
            return [s for s in self._sessions.values() if not s.is_terminal]

    async def list_all(self) -> List[CallSession]:
        async with self._lock:
            return list(self._sessions.values())

    async def expire_stale(
        self, pending_max_age_seconds: float, ended_retention_seconds: float
    ) -> List[CallSession]:
        """Fail calls that never went live and forget finished calls. Returns the
        sessions that were failed so the caller can persist them."""
        now = _now()
        failed: List[CallSession] = []
        async with self._lock:
            for session in list(self._sessions.values()):
                age = (now - session.started_at).total_seconds()
                if session.status in PENDING_STATUSES and age > pending_max_age_seconds:
                    failed.append(session)
                elif session.is_terminal and session.ended_at is not None:
                    if (now - session.ended_at).total_seconds() > ended_retention_seconds:
                        self._forget(session)
        for session in failed:
            await session.set_status(CallStatus.FAILED, reason="never_went_live")
        return failed

    def _forget(self, session: CallSession) -> None:
        self._sessions.pop(session.call_id, None)
        for key in (session.provider_call_id, session.realtime_call_id):
            if key and self._provider_map.get(key) == session.call_id:
                del self._provider_map[key]


registry = CallRegistry()
