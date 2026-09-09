import pytest
import asyncio
from grokcall.core.registry import registry
from grokcall.core.models import CallStatus
from grokcall.core.pipeline import CallPipeline
from grokcall.adapters.fakes import FakeTelephonyLeg, FakeSTT, FakeTTS
from grokcall.api.mcp_server import (
    get_call,
    speak,
    wait_for_next_utterance,
    take_message,
    hang_up,
)


@pytest.mark.asyncio
async def test_full_call_conversation_lifecycle():
    """Simulate a complete call conversation lifecycle:

    1. Incoming call creates session in WAITING state.
    2. Realtime telephony leg connects and pipeline transitions session to LIVE.
    3. Grok Bot wakes via Slack, retrieves call state via get_call.
    4. Grok speaks initial greeting in Swedish.
    5. Caller speaks English asking for Patrik's availability.
    6. Grok switches naturally to English and replies.
    7. Caller leaves a message.
    8. Grok records message via take_message.
    9. Grok hangs up gracefully with closing words.
    """
    # 1. Incoming call creates session
    session = await registry.create_session(
        caller="+46709876543",
        called="+46766861234",
        provider_call_id="c_e2e_999",
    )
    assert session.status == CallStatus.WAITING
    call_id = session.call_id

    # 2. Telephony connects
    telephony = FakeTelephonyLeg()
    stt = FakeSTT()
    tts = FakeTTS(delay_per_chunk=0.0)

    pipeline = CallPipeline(session, telephony, stt, tts, hold_timeout_seconds=5.0)
    await pipeline.start()
    assert session.status == CallStatus.LIVE

    # 3. Grok wakes and inspects call
    call_info = await get_call(call_id)
    assert call_info["caller"] == "+46709876543"

    # 4. Grok speaks initial greeting in Swedish
    greeting_res = await speak(
        call_id,
        "Hej! Patrik kunde inte svara just nu. Jag är hans AI-assistent. Hur kan jag hjälpa dig?",
        language="sv",
    )
    assert greeting_res["status"] == "speaking"
    # Allow TTS stream
    await asyncio.sleep(0.01)
    assert len(telephony.sent_chunks) == 3

    # 5. Caller speaks English
    await stt.simulate_committed("Hi, is Patrik available tomorrow afternoon?", "en")

    # 6. Grok receives utterance
    turn_event = await wait_for_next_utterance(call_id, after_turn=1, timeout_seconds=1.0)
    assert turn_event["event"] == "utterance"
    assert turn_event["language"] == "en"
    assert "tomorrow afternoon" in turn_event["text"]

    # 7. Grok responds naturally in English
    reply_res = await speak(
        call_id,
        "I can check whether he appears to be available. Is there a particular time you're interested in?",
        language="en",
    )
    assert reply_res["status"] == "speaking"
    await asyncio.sleep(0.01)

    # 8. Caller leaves a message
    await stt.simulate_committed("Around 3 PM please. Ask him to call Johan.", "en")
    turn2 = await wait_for_next_utterance(call_id, after_turn=2, timeout_seconds=1.0)
    assert turn2["event"] == "utterance"

    msg_save = await take_message(
        call_id,
        caller_name="Johan",
        message="Call back tomorrow around 3 PM",
        callback_requested=True,
    )
    assert msg_save["status"] == "saved"

    # 9. Grok hangs up with final words
    hang_res = await hang_up(call_id, final_words="Thank you, I will pass this to Patrik. Goodbye!")
    assert hang_res["status"] == "ended"

    assert session.status == CallStatus.ENDED
    assert len(session.turns) >= 3
    assert len(session.messages) == 1
    assert telephony.hungup is True
