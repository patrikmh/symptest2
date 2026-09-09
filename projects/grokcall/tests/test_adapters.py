import pytest
from grokcall.adapters.fortysixelks.telephony import FortySixElksActionBuilder
from grokcall.adapters.slack_wake import SlackWakeNotifier
from grokcall.adapters.fakes import FakeTelephonyLeg, FakeSTT, FakeTTS, FakeWakeNotifier


def test_action_builder():
    action = FortySixElksActionBuilder.play_and_connect(
        "https://example.com/connecting.mp3",
        "+46766860000"
    )
    assert action["play"] == "https://example.com/connecting.mp3"
    assert action["next"]["connect"] == "+46766860000"

    hangup_action = FortySixElksActionBuilder.hangup()
    assert hangup_action["hangup"] == "busy"


@pytest.mark.asyncio
async def test_fake_adapters():
    telephony = FakeTelephonyLeg()
    await telephony.send_audio_chunk(b"\xaa\xbb")
    assert len(telephony.sent_chunks) == 1
    await telephony.interrupt()
    assert telephony.interrupted_count == 1
    await telephony.hangup()
    assert telephony.hungup is True

    stt = FakeSTT()
    partial_results = []
    committed_results = []

    async def on_p(text):
        partial_results.append(text)

    async def on_c(text, lang):
        committed_results.append((text, lang))

    await stt.start(on_p, on_c)
    await stt.simulate_partial("Hej")
    await stt.simulate_committed("Hej, hur mår du?", "sv")

    assert partial_results == ["Hej"]
    assert committed_results == [("Hej, hur mår du?", "sv")]

    tts = FakeTTS(delay_per_chunk=0.0)
    chunks = [c async for c in tts.synthesize_stream("Test svar")]
    assert len(chunks) == 3
    assert tts.synthesized_texts == ["Test svar"]

    wake = FakeWakeNotifier()
    await wake.notify_call_started("c1", "+467", "+468")
    assert wake.notified_calls == ["c1"]
