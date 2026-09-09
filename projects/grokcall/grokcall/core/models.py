from enum import Enum
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid


class CallStatus(str, Enum):
    RINGING = "ringing"
    WAITING = "waiting"
    WAKING_AGENT = "waking_agent"
    CONNECTING = "connecting"
    LIVE = "live"
    ENDING = "ending"
    ENDED = "ended"
    FAILED = "failed"


class Speaker(str, Enum):
    CALLER = "caller"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class CallTurn(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    turn_number: int
    speaker: Speaker
    text: str
    language: Optional[str] = "sv"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CallMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    caller_name: Optional[str] = None
    message: str
    callback_requested: bool = True
    urgency: str = "normal"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CallTimings(BaseModel):
    incoming_webhook_at: Optional[datetime] = None
    slack_event_sent_at: Optional[datetime] = None
    realtime_connected_at: Optional[datetime] = None
    grok_first_mcp_call_at: Optional[datetime] = None
    caller_turn_committed_at: Optional[datetime] = None
    grok_response_received_at: Optional[datetime] = None
    tts_first_audio_at: Optional[datetime] = None
    call_ended_at: Optional[datetime] = None

    def compute_latencies(self) -> Dict[str, Optional[float]]:
        latencies: Dict[str, Optional[float]] = {}
        if self.incoming_webhook_at and self.slack_event_sent_at:
            latencies["slack_wake_latency_ms"] = (
                self.slack_event_sent_at - self.incoming_webhook_at
            ).total_seconds() * 1000

        if self.incoming_webhook_at and self.grok_first_mcp_call_at:
            latencies["grok_wake_latency_ms"] = (
                self.grok_first_mcp_call_at - self.incoming_webhook_at
            ).total_seconds() * 1000

        if self.caller_turn_committed_at and self.grok_response_received_at:
            latencies["grok_inference_latency_ms"] = (
                self.grok_response_received_at - self.caller_turn_committed_at
            ).total_seconds() * 1000

        if self.grok_response_received_at and self.tts_first_audio_at:
            latencies["tts_startup_latency_ms"] = (
                self.tts_first_audio_at - self.grok_response_received_at
            ).total_seconds() * 1000

        if self.caller_turn_committed_at and self.tts_first_audio_at:
            latencies["total_turn_latency_ms"] = (
                self.tts_first_audio_at - self.caller_turn_committed_at
            ).total_seconds() * 1000

        return latencies
