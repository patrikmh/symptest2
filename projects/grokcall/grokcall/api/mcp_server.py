import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from mcp.server.mcpserver import MCPServer

from grokcall.core.config import settings
from grokcall.core.models import CallStatus
from grokcall.core.registry import CallSession, registry

logger = logging.getLogger("grokcall.mcp")

mcp_server = MCPServer(
    name="grokcall",
    title="GrokCall Phone Assistant",
    instructions=(
        "Tools for holding a live phone conversation. Typical loop: get_call, speak a "
        "greeting, then repeat wait_for_next_utterance -> reason -> speak until the "
        "caller is done; save anything worth keeping with take_message and finish with "
        "hang_up. wait_for_next_utterance blocks for at most 25 seconds; on 'timeout' "
        "simply call it again with the same after_turn."
    ),
    version="1.0.0",
)


async def _session_or_error(call_id: str) -> tuple[Optional[CallSession], Optional[Dict[str, Any]]]:
    session = await registry.get_by_id(call_id)
    if session is None:
        return None, {"error": "call_not_found", "call_id": call_id}
    session.mark_agent_activity()
    return session, None


@mcp_server.tool()
async def get_active_calls() -> List[Dict[str, Any]]:
    """List calls that are waiting for, or talking to, the assistant."""
    now = datetime.now(timezone.utc)
    return [
        {
            "call_id": s.call_id,
            "caller": s.caller,
            "called": s.called,
            "status": s.status.value,
            "language": s.detected_language,
            "latest_turn": s.latest_turn_number,
            "duration_seconds": round((now - s.started_at).total_seconds(), 1),
        }
        for s in await registry.list_active()
    ]


@mcp_server.tool()
async def get_call(call_id: str) -> Dict[str, Any]:
    """Full state of one call: caller, status, language, transcript turns, saved
    messages and timing information."""
    session, err = await _session_or_error(call_id)
    if err:
        return err
    return session.to_dict()


@mcp_server.tool()
async def wait_for_next_utterance(
    call_id: str,
    after_turn: int = 0,
    timeout_seconds: float = 20.0,
) -> Dict[str, Any]:
    """Long-poll for the caller's next finished utterance after turn ``after_turn``.

    Returns one of:
      {"event": "utterance", "turn": n, "text": "...", "language": "sv"|"en"}
      {"event": "timeout", "latest_turn": n}   -> call again with the same after_turn
      {"event": "call_ended"}
    """
    session, err = await _session_or_error(call_id)
    if err:
        return {"event": "call_ended", **err}
    if session.is_terminal:
        return {"event": "call_ended", "reason": session.end_reason}

    timeout = max(0.0, min(float(timeout_seconds), settings.utterance_poll_max_seconds))
    turn = await session.wait_for_turn(after_turn=after_turn, timeout_seconds=timeout)
    if turn is not None:
        return {
            "event": "utterance",
            "turn": turn.turn_number,
            "text": turn.text,
            "language": turn.language,
        }
    if session.is_terminal:
        return {"event": "call_ended", "reason": session.end_reason}
    return {"event": "timeout", "latest_turn": session.latest_turn_number}


@mcp_server.tool()
async def speak(call_id: str, text: str, language: Optional[str] = None) -> Dict[str, Any]:
    """Say ``text`` to the caller. Sentences are played in the order they are
    submitted. If the audio leg is not connected yet the text is queued and played
    as soon as it is."""
    session, err = await _session_or_error(call_id)
    if err:
        return err
    if session.is_terminal:
        return {"error": "call_ended", "reason": session.end_reason}
    if session.handled_by == "fallback":
        return {"error": "handled_by_fallback", "detail": "The fallback assistant has taken over this call."}

    pipeline = await session.queue_or_handoff_speech(text, language)
    if pipeline is None:
        return {"status": "queued", "call_status": session.status.value}
    await pipeline.speak(text, language=language)
    return {"status": "speaking", "turn": session.latest_turn_number}


@mcp_server.tool()
async def interrupt_speech(call_id: str) -> Dict[str, Any]:
    """Stop whatever the assistant is saying and drop anything queued."""
    session, err = await _session_or_error(call_id)
    if err:
        return err
    session.pending_speech.clear()
    if session.pipeline is not None:
        await session.pipeline.interrupt_playback()
    return {"status": "interrupted"}


@mcp_server.tool()
async def take_message(
    call_id: str,
    message: str,
    caller_name: Optional[str] = None,
    callback_requested: bool = False,
    urgency: str = "normal",
) -> Dict[str, Any]:
    """Save a message left by the caller."""
    session, err = await _session_or_error(call_id)
    if err:
        return err
    saved = await session.add_message(
        caller_name=caller_name,
        message=message,
        callback_requested=callback_requested,
        urgency=urgency,
    )
    return {"status": "saved", "message_id": saved.id}


@mcp_server.tool()
async def hang_up(call_id: str, final_words: Optional[str] = None) -> Dict[str, Any]:
    """End the call, optionally saying ``final_words`` first."""
    session, err = await _session_or_error(call_id)
    if err:
        return err
    if session.is_terminal:
        return {"status": "ended", "reason": session.end_reason}
    if session.pipeline is not None:
        await session.pipeline.hangup(final_words=final_words)
    else:
        if final_words:
            session.pending_speech.append((final_words, session.detected_language))
        session.close_on_connect = True
        await session.set_status(CallStatus.ENDED, reason="assistant_hangup_before_connect")
        from grokcall.api.app import persist_session
        await persist_session(session)
    return {"status": "ended", "turns": session.latest_turn_number, "messages": len(session.messages)}
