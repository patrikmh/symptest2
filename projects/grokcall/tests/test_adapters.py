import base64
import json
from urllib.parse import parse_qs, urlparse

import pytest

from grokcall.adapters.elevenlabs.stt import ElevenLabsScribeSTT
from grokcall.adapters.fakes import FakeSTT, FakeTelephonyLeg, FakeTTS, FakeWakeNotifier
from grokcall.adapters.fortysixelks.telephony import (
    FortySixElksActionBuilder,
    FortySixElksWebSocketLeg,
    parse_hangup_form,
    parse_incoming_form,
)


class RecordingSocket:
    def __init__(self):
        self.sent = []

    async def send_text(self, data: str) -> None:
        self.sent.append(json.loads(data))


def test_action_builders():
    assert FortySixElksActionBuilder.play_then_connect("https://x/c.mp3", "+46766860000") == {
        "play": "https://x/c.mp3",
        "next": {"connect": "+46766860000"},
    }
    assert FortySixElksActionBuilder.connect("+46766860000") == {"connect": "+46766860000"}
    assert FortySixElksActionBuilder.hangup() == {"hangup": "busy"}


def test_webhook_form_parsing():
    call = parse_incoming_form({"callid": "c1", "from": "+4670", "to": "+4676", "direction": "incoming"})
    assert (call.callid, call.caller, call.called) == ("c1", "+4670", "+4676")
    assert parse_hangup_form({"id": "c1", "state": "success"}) == "c1"
    assert parse_hangup_form({"callid": "c2"}) == "c2"
    assert parse_hangup_form({"state": "failed"}) is None


@pytest.mark.asyncio
async def test_realtime_leg_protocol_sequence():
    sock = RecordingSocket()
    leg = FortySixElksWebSocketLeg(sock, callid="c1", caller="+4670", called="+4676")

    await leg.setup_audio_session()
    assert sock.sent == [
        {"t": "listening", "format": "ulaw"},
        {"t": "sending", "format": "ulaw"},
    ]

    await leg.send_audio_chunk(b"\xff\x00")
    assert sock.sent[-1] == {"t": "audio", "data": base64.b64encode(b"\xff\x00").decode()}

    # interrupt clears the provider buffer; audio may only resume after a new
    # "sending" message, which the leg must re-send on its own.
    await leg.interrupt()
    assert sock.sent[-1] == {"t": "interrupt"}
    await leg.send_audio_chunk(b"\x01")
    assert sock.sent[-2] == {"t": "sending", "format": "ulaw"}
    assert sock.sent[-1]["t"] == "audio"

    await leg.hangup()
    assert sock.sent[-1] == {"t": "bye"}
    # nothing may be sent after bye, and hangup is idempotent
    await leg.send_audio_chunk(b"\x02")
    await leg.hangup()
    assert sock.sent[-1] == {"t": "bye"}
    assert sum(1 for m in sock.sent if m["t"] == "bye") == 1


def test_stt_url_auto_detect_by_default():
    stt = ElevenLabsScribeSTT(api_key="k")
    q = parse_qs(urlparse(stt.build_url()).query)
    assert q["audio_format"] == ["ulaw_8000"]
    assert q["commit_strategy"] == ["vad"]
    assert q["include_language_detection"] == ["true"]
    assert q["model_id"] == ["scribe_v2_realtime"]
    assert "language_code" not in q


def test_stt_url_with_pinned_language_and_hints():
    stt = ElevenLabsScribeSTT(api_key="k", language_code="sv", secondary_languages=["en"])
    q = parse_qs(urlparse(stt.build_url()).query)
    assert q["language_code"] == ["sv"]
    assert q["secondary_languages"] == ["en"]


@pytest.mark.asyncio
async def test_fake_adapters():
    telephony = FakeTelephonyLeg()
    await telephony.send_audio_chunk(b"\xaa\xbb")
    await telephony.interrupt()
    await telephony.hangup()
    assert (len(telephony.sent_chunks), telephony.interrupted_count, telephony.hungup) == (1, 1, True)

    stt = FakeSTT()
    partials, committed = [], []

    async def on_p(text):
        partials.append(text)

    async def on_c(text, lang):
        committed.append((text, lang))

    await stt.start(on_p, on_c)
    await stt.simulate_partial("Hej")
    await stt.simulate_committed("Hej, hur mår du?", "sv")
    assert partials == ["Hej"] and committed == [("Hej, hur mår du?", "sv")]

    tts = FakeTTS(delay_per_chunk=0.0)
    chunks = [c async for c in tts.synthesize_stream("Test svar")]
    assert len(chunks) == 3 and tts.synthesized_texts == ["Test svar"]

    wake = FakeWakeNotifier()
    assert await wake.notify_call_started("c1", "+467", "+468")
    assert wake.notified_calls == ["c1"]
