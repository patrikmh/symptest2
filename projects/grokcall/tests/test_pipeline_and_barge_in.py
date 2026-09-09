import pytest
import asyncio
from grokcall.core.models import CallStatus, Speaker
from grokcall.core.registry import CallSession
from grokcall.core.pipeline import CallPipeline
from grokcall.adapters.fakes import FakeTelephonyLeg, FakeSTT, FakeTTS


@pytest.mark.asyncio
async def test_pipeline_start_and_speak():
    session = CallSession("c_test", "+4670111", "+4676686")
    telephony = FakeTelephonyLeg()
    stt = FakeSTT()
    tts = FakeTTS(delay_per_chunk=0.01)

    pipeline = CallPipeline(session, telephony, stt, tts, hold_timeout_seconds=5.0)
    await pipeline.start()

    assert session.status == CallStatus.LIVE
    assert stt.is_open is True

    # Assistant speaks
    await pipeline.speak("Hej! Patrik kan inte svara.")
    # Allow speech stream to run
    await asyncio.sleep(0.05)

    assert len(telephony.sent_chunks) > 0
    assert len(session.turns) == 1
    assert session.turns[0].speaker == Speaker.ASSISTANT

    await pipeline.hangup()
    assert session.status == CallStatus.ENDED
    assert telephony.hungup is True


@pytest.mark.asyncio
async def test_pipeline_barge_in_interruption():
    session = CallSession("c_barge", "+4670111", "+4676686")
    telephony = FakeTelephonyLeg()
    stt = FakeSTT()
    # TTS with slight delay to simulate ongoing playback
    tts = FakeTTS(delay_per_chunk=0.05)

    pipeline = CallPipeline(session, telephony, stt, tts, hold_timeout_seconds=5.0)
    await pipeline.start()

    # Assistant starts a long sentence
    await pipeline.speak("Jag kan kontrollera om Patrik är tillgänglig imorgon eftermiddag...")
    await asyncio.sleep(0.02)
    assert pipeline._is_assistant_speaking is True

    # Caller interrupts with speech
    await stt.simulate_partial("Nej, jag vill bara")
    assert telephony.interrupted_count >= 1
    assert pipeline._is_assistant_speaking is False

    # Caller finishes utterance
    await stt.simulate_committed("Nej, jag vill bara lämna ett meddelande.", "sv")
    assert len(session.turns) == 2
    assert session.turns[1].speaker == Speaker.CALLER
    assert session.turns[1].text == "Nej, jag vill bara lämna ett meddelande."

    await pipeline.hangup()
