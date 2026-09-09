import asyncio

import pytest

from grokcall.adapters.fakes import FakeSTT, FakeTelephonyLeg, FakeTTS
from grokcall.api.mcp_server import (
    get_active_calls,
    get_call,
    hang_up,
    interrupt_speech,
    speak,
    take_message,
    wait_for_next_utterance,
)
from grokcall.core.models import CallStatus
from grokcall.core.pipeline import CallPipeline
from grokcall.core.registry import registry


@pytest.mark.asyncio
async def test_tools_before_audio_leg_exists():
    session = await registry.create_session("+46701111111", "+46766860000")
    call_id = session.call_id

    active = await get_active_calls()
    assert any(c["call_id"] == call_id for c in active)

    details = await get_call(call_id)
    assert details["caller"] == "+46701111111" and details["status"] == "waiting"
    assert session.agent_ready, "any MCP call marks the agent as present"

    # speak() before the realtime leg is connected is queued, not lost
    res = await speak(call_id, "Hej! Jag är Patriks AI-assistent.", "sv")
    assert res["status"] == "queued"
    assert session.pending_speech == [("Hej! Jag är Patriks AI-assistent.", "sv")]

    pipeline = CallPipeline(session, FakeTelephonyLeg(), FakeSTT(), FakeTTS(delay_per_chunk=0.0))
    await pipeline.start()
    await asyncio.sleep(0.05)
    assert pipeline.tts.synthesized_texts == ["Hej! Jag är Patriks AI-assistent."]
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_full_tool_loop():
    session = await registry.create_session("+46701111111", "+46766860000")
    call_id = session.call_id
    pipeline = CallPipeline(session, FakeTelephonyLeg(), FakeSTT(), FakeTTS(delay_per_chunk=0.0))
    await pipeline.start()

    res = await speak(call_id, "Hej! Patrik kunde inte svara just nu. Hur kan jag hjälpa dig?")
    assert res["status"] == "speaking" and res["turn"] == 1

    async def caller_speaks():
        await asyncio.sleep(0.05)
        await pipeline.stt.simulate_committed("Kan han ringa mig imorgon efter lunch?", "sv")

    asyncio.create_task(caller_speaks())
    event = await wait_for_next_utterance(call_id, after_turn=1, timeout_seconds=2.0)
    assert event == {
        "event": "utterance",
        "turn": 2,
        "text": "Kan han ringa mig imorgon efter lunch?",
        "language": "sv",
    }

    # nothing new: timeout (clamped, short here)
    event = await wait_for_next_utterance(call_id, after_turn=2, timeout_seconds=0.05)
    assert event == {"event": "timeout", "latest_turn": 2}

    saved = await take_message(call_id, message="Ring imorgon efter lunch", caller_name="Johan", callback_requested=True)
    assert saved["status"] == "saved" and len(session.messages) == 1

    assert (await interrupt_speech(call_id))["status"] == "interrupted"

    res = await hang_up(call_id, final_words="Tack för samtalet, hej då!")
    assert res["status"] == "ended"
    assert session.status == CallStatus.ENDED
    assert pipeline.tts.synthesized_texts[-1] == "Tack för samtalet, hej då!"


@pytest.mark.asyncio
async def test_wait_returns_call_ended_promptly_when_hung_up():
    session = await registry.create_session("+46701111111", "+46766860000")
    pipeline = CallPipeline(session, FakeTelephonyLeg(), FakeSTT(), FakeTTS(delay_per_chunk=0.0))
    await pipeline.start()

    async def hang_up_soon():
        await asyncio.sleep(0.05)
        await hang_up(session.call_id)

    asyncio.create_task(hang_up_soon())
    started = asyncio.get_running_loop().time()
    event = await wait_for_next_utterance(session.call_id, after_turn=0, timeout_seconds=20)
    assert event["event"] == "call_ended"
    assert asyncio.get_running_loop().time() - started < 1.0

    # subsequent tool calls on an ended call are explicit about it
    assert (await speak(session.call_id, "hallå?"))["error"] == "call_ended"
    assert (await wait_for_next_utterance(session.call_id))["event"] == "call_ended"


@pytest.mark.asyncio
async def test_unknown_call_id():
    assert (await get_call("nope"))["error"] == "call_not_found"
    assert (await wait_for_next_utterance("nope"))["event"] == "call_ended"
    assert (await speak("nope", "x"))["error"] == "call_not_found"


@pytest.mark.asyncio
async def test_speak_refused_once_fallback_has_taken_over():
    session = await registry.create_session("+46701111111", "+46766860000")
    session.handled_by = "fallback"
    res = await speak(session.call_id, "Hej")
    assert res["error"] == "handled_by_fallback"
