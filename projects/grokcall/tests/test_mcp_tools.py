import pytest
import asyncio
from grokcall.core.registry import registry
from grokcall.core.models import CallStatus
from grokcall.api.mcp_server import (
    get_active_calls,
    get_call,
    wait_for_next_utterance,
    speak,
    interrupt_speech,
    take_message,
    hang_up,
)


@pytest.mark.asyncio
async def test_mcp_tools_flow():
    session = await registry.create_session("+46701111111", "+46766860000")
    call_id = session.call_id

    # 1. get_active_calls
    active = await get_active_calls()
    assert any(c["call_id"] == call_id for c in active)

    # 2. get_call
    details = await get_call(call_id)
    assert details["caller"] == "+46701111111"
    assert details["status"] == "waiting"

    # 3. speak (initial greeting)
    res_speak = await speak(call_id, "Hej! Patrik kunde inte svara just nu. Hur kan jag hjälpa dig?")
    assert res_speak["status"] == "speaking"
    assert len(session.turns) == 1

    # 4. wait_for_next_utterance with long polling
    async def simulate_caller():
        await asyncio.sleep(0.05)
        await session.add_caller_turn("Kan han ringa mig imorgon efter lunch?")

    asyncio.create_task(simulate_caller())

    event = await wait_for_next_utterance(call_id=call_id, after_turn=1, timeout_seconds=2.0)
    assert event["event"] == "utterance"
    assert event["text"] == "Kan han ringa mig imorgon efter lunch?"
    assert event["turn"] == 2

    # 5. take_message
    msg_res = await take_message(
        call_id=call_id,
        caller_name="Johan",
        message="Call back tomorrow after lunch",
        callback_requested=True,
    )
    assert msg_res["status"] == "saved"
    assert len(session.messages) == 1

    # 6. interrupt_speech
    int_res = await interrupt_speech(call_id)
    assert int_res["status"] == "interrupted"

    # 7. hang_up
    hang_res = await hang_up(call_id, final_words="Tack för samtalet, hej då!")
    assert hang_res["status"] == "ended"
    assert session.status == CallStatus.ENDED
