import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from mcp.server.mcpserver import MCPServer

from grokcall.core.registry import registry
from grokcall.core.models import CallStatus

logger = logging.getLogger("grokcall.mcp")

# Initialize MCP server
mcp_server = MCPServer(
    name="grokcall-mcp",
    title="GrokCall Phone Assistant MCP",
    description="MCP tools exposed for Grok Bot telephone interaction.",
    version="1.0.0",
)


@mcp_server.tool()
async def get_active_calls() -> List[Dict[str, Any]]:
    """Retrieve calls currently awaiting or interacting with the assistant."""
    calls = await registry.list_active()
    now = datetime.now(timezone.utc)
    return [
        {
            "call_id": c.call_id,
            "caller": c.caller,
            "status": c.status.value,
            "language": c.detected_language,
            "duration_seconds": (now - c.started_at).total_seconds(),
        }
        for c in calls
    ]


@mcp_server.tool()
async def get_call(call_id: str) -> Dict[str, Any]:
    """Retrieve full call details, transcript, messages, and state."""
    session = await registry.get_by_id(call_id)
    if not session:
        return {"error": f"Call {call_id} not found"}

    if not session.timings.grok_first_mcp_call_at:
        session.timings.grok_first_mcp_call_at = datetime.now(timezone.utc)

    return session.to_dict()


@mcp_server.tool()
async def wait_for_next_utterance(
    call_id: str,
    after_turn: int = 0,
    timeout_seconds: int = 20,
) -> Dict[str, Any]:
    """Long-poll for the caller's next committed speech utterance.

    Returns:
    - {"event": "utterance", "turn": 2, "text": "...", "language": "sv"}
    - {"event": "timeout", "latest_turn": 1}
    - {"event": "call_ended"}
    """
    session = await registry.get_by_id(call_id)
    if not session:
        return {"event": "call_ended", "error": f"Call {call_id} not found"}

    if session.status in (CallStatus.ENDED, CallStatus.FAILED):
        return {"event": "call_ended"}

    # Clamp timeout to max 25s
    timeout = min(float(timeout_seconds), 25.0)
    turn = await session.wait_for_turn(after_turn=after_turn, timeout_seconds=timeout)

    if turn:
        return {
            "event": "utterance",
            "turn": turn.turn_number,
            "text": turn.text,
            "language": turn.language,
        }

    if session.status in (CallStatus.ENDED, CallStatus.FAILED):
        return {"event": "call_ended"}

    return {
        "event": "timeout",
        "latest_turn": len(session.turns),
    }


@mcp_server.tool()
async def speak(
    call_id: str,
    text: str,
    language: Optional[str] = None,
) -> Dict[str, Any]:
    """Synthesize speech using ElevenLabs and stream it directly to the caller."""
    session = await registry.get_by_id(call_id)
    if not session:
        return {"error": f"Call {call_id} not found"}

    if session.status in (CallStatus.ENDED, CallStatus.FAILED):
        return {"error": "Call has already ended"}

    if session.pipeline:
        await session.pipeline.speak(text, language=language)
    else:
        # Pipeline not yet attached, record turn directly
        await session.add_assistant_turn(text, language=language)

    return {
        "status": "speaking",
        "turn": len(session.turns),
    }


@mcp_server.tool()
async def interrupt_speech(call_id: str) -> Dict[str, Any]:
    """Immediately stop and clear any ongoing or buffered assistant speech."""
    session = await registry.get_by_id(call_id)
    if not session:
        return {"error": f"Call {call_id} not found"}

    if session.pipeline:
        await session.pipeline.interrupt_playback()

    return {"status": "interrupted"}


@mcp_server.tool()
async def take_message(
    call_id: str,
    caller_name: Optional[str] = None,
    message: str = "",
    callback_requested: bool = True,
    urgency: str = "normal",
) -> Dict[str, Any]:
    """Record a structured caller message."""
    session = await registry.get_by_id(call_id)
    if not session:
        return {"error": f"Call {call_id} not found"}

    saved = await session.add_message(
        caller_name=caller_name,
        message=message,
        callback_requested=callback_requested,
        urgency=urgency,
    )
    return {
        "status": "saved",
        "message_id": saved.id,
    }


@mcp_server.tool()
async def hang_up(
    call_id: str,
    final_words: Optional[str] = None,
) -> Dict[str, Any]:
    """Gracefully terminate the telephone call after optionally speaking final words."""
    session = await registry.get_by_id(call_id)
    if not session:
        return {"error": f"Call {call_id} not found"}

    if session.pipeline:
        await session.pipeline.hangup(final_words=final_words)
    else:
        await session.set_status(CallStatus.ENDED)

    return {"status": "ended"}
