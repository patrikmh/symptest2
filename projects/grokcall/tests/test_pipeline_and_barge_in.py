import asyncio

import pytest

from grokcall.adapters.fakes import FakeSTT, FakeTelephonyLeg, FakeTTS
from grokcall.core.models import CallStatus, Speaker
from grokcall.core.pipeline import CallPipeline
from grokcall.core.registry import CallSession


def make_pipeline(tts_delay=0.0, **kwargs):
    session = CallSession("c_test", "+4670111", "+4676686")
    telephony, stt, tts = FakeTelephonyLeg(), FakeSTT(), FakeTTS(delay_per_chunk=tts_delay)
    kwargs.setdefault("hold_timeout_seconds", 5.0)
    kwargs.setdefault("fallback_timeout_seconds", 10.0)
    pipeline = CallPipeline(session, telephony, stt, tts, **kwargs)
    return session, telephony, stt, tts, pipeline


async def settle():
    await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_start_speak_and_hangup():
    session, telephony, stt, tts, pipeline = make_pipeline()
    await pipeline.start()
    assert session.status == CallStatus.LIVE
    assert stt.is_open

    await pipeline.speak("Hej! Patrik kan inte svara.")
    await settle()
    assert len(telephony.sent_chunks) == 3
    assert session.turns[0].speaker == Speaker.ASSISTANT
    assert session.agent_ready  # speak() counts as the agent having arrived

    await pipeline.hangup()
    assert session.status == CallStatus.ENDED
    assert telephony.hungup and not stt.is_open


@pytest.mark.asyncio
async def test_two_speaks_play_in_order_without_cutting_each_other_off():
    session, telephony, stt, tts, pipeline = make_pipeline(tts_delay=0.01)
    await pipeline.start()
    await pipeline.speak("Ett ögonblick, jag kollar.")
    await pipeline.speak("Han verkar vara ledig efter tre.")
    await asyncio.sleep(0.2)
    assert tts.synthesized_texts == ["Ett ögonblick, jag kollar.", "Han verkar vara ledig efter tre."]
    assert len(telephony.sent_chunks) == 6
    assert telephony.interrupted_count == 0
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_barge_in_on_partial_transcript_while_speaking():
    session, telephony, stt, tts, pipeline = make_pipeline(tts_delay=0.05)
    await pipeline.start()

    await pipeline.speak("Jag kan kontrollera om Patrik är tillgänglig imorgon eftermiddag...")
    await asyncio.sleep(0.02)
    assert pipeline.output_pending

    await stt.simulate_partial("Nej, jag vill bara")
    assert telephony.interrupted_count == 1
    assert not pipeline.is_speaking
    assert len(telephony.sent_chunks) < 3, "remaining chunks must not be sent after barge-in"

    await stt.simulate_committed("Nej, jag vill bara lämna ett meddelande.", "sv")
    assert session.turns[-1].speaker == Speaker.CALLER
    assert session.turns[-1].text == "Nej, jag vill bara lämna ett meddelande."
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_barge_in_after_streaming_finished_but_audio_still_buffered():
    # TTS delivers a whole sentence in a few ms; the caller hears it for seconds.
    session, telephony, stt, tts, pipeline = make_pipeline()
    await pipeline.start()
    await pipeline.speak("En ganska lång mening som fortfarande spelas upp hos operatören.")
    await settle()
    assert not pipeline.is_speaking
    assert pipeline.output_pending, "480 bytes of mu-law is 60 ms of audio still buffered"

    await stt.simulate_committed("Vänta!", "sv")
    assert telephony.interrupted_count == 1
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_speech_works_again_after_interrupt():
    session, telephony, stt, tts, pipeline = make_pipeline(tts_delay=0.02)
    await pipeline.start()
    await pipeline.speak("Första meningen som avbryts")
    await asyncio.sleep(0.01)
    await pipeline.interrupt_playback()
    sent_before = len(telephony.sent_chunks)

    await pipeline.speak("Andra meningen")
    await asyncio.sleep(0.15)
    assert len(telephony.sent_chunks) == sent_before + 3
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_hangup_with_final_words_drains_speech_first():
    session, telephony, stt, tts, pipeline = make_pipeline(tts_delay=0.01)
    await pipeline.start()
    await pipeline.hangup(final_words="Tack och hej då!")
    assert tts.synthesized_texts == ["Tack och hej då!"]
    assert len(telephony.sent_chunks) == 3
    assert telephony.hungup
    assert session.status == CallStatus.ENDED


@pytest.mark.asyncio
async def test_connecting_line_spoken_when_no_audio_clip_configured():
    session, telephony, stt, tts, pipeline = make_pipeline(speak_connecting_line=True)
    await pipeline.start()
    await settle()
    assert tts.synthesized_texts and "AI-assistent" in tts.synthesized_texts[0]
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_pending_speech_from_before_connect_is_played_on_start():
    session, telephony, stt, tts, pipeline = make_pipeline()
    session.pending_speech.append(("Hej! Jag är Patriks AI-assistent.", "sv"))
    await pipeline.start()
    await settle()
    assert tts.synthesized_texts == ["Hej! Jag är Patriks AI-assistent."]
    assert session.pending_speech == []
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_hold_line_then_fallback_when_agent_never_arrives():
    session, telephony, stt, tts, pipeline = make_pipeline(
        hold_timeout_seconds=0.05, fallback_timeout_seconds=0.1
    )
    await pipeline.start()
    await asyncio.sleep(0.2)

    assert any("snart här" in t for t in tts.synthesized_texts), "hold line expected"
    assert session.handled_by == "fallback"
    assert any("automatisk assistent" in t for t in tts.synthesized_texts)

    await stt.simulate_committed("Det är Johan, jag vill prata om fakturan.", "sv")
    await settle()
    assert any("ringer upp" in t for t in tts.synthesized_texts)
    await stt.simulate_committed("Ja gärna", "sv")
    await asyncio.sleep(0.1)

    assert session.status == CallStatus.ENDED
    assert session.end_reason == "fallback_complete"
    assert telephony.hungup
    assert len(session.messages) == 1
    assert session.messages[0].message == "Det är Johan, jag vill prata om fakturan."
    assert session.messages[0].callback_requested is True


@pytest.mark.asyncio
async def test_agent_activity_cancels_hold_and_fallback():
    session, telephony, stt, tts, pipeline = make_pipeline(
        hold_timeout_seconds=0.05, fallback_timeout_seconds=0.1
    )
    await pipeline.start()
    session.mark_agent_activity()  # e.g. Grok called get_call
    await asyncio.sleep(0.2)
    assert tts.synthesized_texts == []
    assert session.handled_by == "grok"
    assert session.status == CallStatus.LIVE
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_leg_closed_by_caller_ends_call_without_sending_audio():
    ended = []

    async def on_ended(s):
        ended.append(s.call_id)

    session, telephony, stt, tts, pipeline = make_pipeline(tts_delay=0.05, on_ended=on_ended)
    await pipeline.start()
    await pipeline.speak("Detta hinner inte spelas upp")
    await asyncio.sleep(0.01)
    await pipeline.on_leg_closed(reason="caller_hangup")
    assert session.status == CallStatus.ENDED
    assert session.end_reason == "caller_hangup"
    assert ended == ["c_test"]
    assert telephony.interrupted_count == 0, "no point flushing a leg that is gone"
