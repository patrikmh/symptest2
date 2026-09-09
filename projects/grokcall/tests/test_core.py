import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from grokcall.core.language import detect_language, normalize_language
from grokcall.core.models import CallStatus, Speaker
from grokcall.core.registry import CallRegistry, CallSession


def test_language_detection():
    assert detect_language("Hej! Patrik kunde inte svara just nu.") == "sv"
    assert detect_language("Tjena, Johan här. Kan han ringa mig senare?") == "sv"
    assert detect_language("Jag vill lämna ett meddelande om projektet.") == "sv"

    assert detect_language("Hi, is Patrik available tomorrow afternoon?") == "en"
    assert detect_language("Hello! I would like to leave a message please.") == "en"
    assert detect_language("Can you ask him to call me back?") == "en"

    assert detect_language("", default="sv") == "sv"
    assert detect_language("12345", default="sv") == "sv"


def test_language_normalisation():
    assert normalize_language("swe") == "sv"
    assert normalize_language("eng") == "en"
    assert normalize_language("en-US") == "en"
    assert normalize_language("SV") == "sv"
    assert normalize_language(None) is None
    assert normalize_language("") is None


@pytest.mark.asyncio
async def test_turns_and_per_turn_latency_markers():
    session = CallSession("call_123", "+46701111111", "+46766860000")
    assert session.status == CallStatus.WAITING

    t1 = await session.add_caller_turn("Hej, kan jag lämna ett meddelande?")
    assert (t1.turn_number, t1.speaker, t1.language) == (1, Speaker.CALLER, "sv")

    t2 = await session.add_assistant_turn("Absolut, vad gäller det?", "sv")
    assert (t2.turn_number, t2.speaker) == (2, Speaker.ASSISTANT)
    assert session.timings.grok_response_received_at is not None

    session.timings.tts_first_audio_at = datetime.now(timezone.utc)
    latencies = session.timings.compute_latencies()
    assert latencies["total_turn_latency_ms"] >= 0
    assert latencies["grok_inference_latency_ms"] >= 0

    # A new caller turn resets the per-turn markers so latencies are per turn.
    await session.add_caller_turn("Hello again", explicit_lang="eng")
    assert session.timings.grok_response_received_at is None
    assert session.timings.tts_first_audio_at is None
    assert session.detected_language == "en"


@pytest.mark.asyncio
async def test_wait_for_turn_wakes_on_new_turn():
    session = CallSession("call_poll", "+46701111111", "+46766860000")

    async def later():
        await asyncio.sleep(0.05)
        await session.add_caller_turn("Hello from caller")

    asyncio.create_task(later())
    turn = await session.wait_for_turn(after_turn=0, timeout_seconds=1.0)
    assert turn is not None and turn.text == "Hello from caller" and turn.language == "en"


@pytest.mark.asyncio
async def test_wait_for_turn_released_when_call_ends():
    session = CallSession("call_end", "+46701111111", "+46766860000")

    async def end_soon():
        await asyncio.sleep(0.05)
        await session.set_status(CallStatus.ENDED, reason="caller_hangup")

    asyncio.create_task(end_soon())
    started = asyncio.get_running_loop().time()
    turn = await session.wait_for_turn(after_turn=0, timeout_seconds=5.0)
    elapsed = asyncio.get_running_loop().time() - started
    assert turn is None
    assert session.is_terminal
    assert elapsed < 1.0, "long-poller must be released as soon as the call ends"


@pytest.mark.asyncio
async def test_wait_for_turn_times_out():
    session = CallSession("call_timeout", "+46701111111", "+46766860000")
    assert await session.wait_for_turn(after_turn=0, timeout_seconds=0.05) is None
    assert not session.is_terminal


@pytest.mark.asyncio
async def test_registry_lookup_and_json_safe_dump():
    reg = CallRegistry()
    s = await reg.create_session("+4670111", "+4676686", provider_call_id="c_elks_99")
    assert s.call_id.startswith("call_")
    assert await reg.get_by_id(s.call_id) is s
    assert await reg.get_by_provider_id("c_elks_99") is s

    await s.add_caller_turn("hej")
    import json
    json.dumps(s.to_dict())  # datetimes must already be serialised


@pytest.mark.asyncio
async def test_bind_realtime_leg_matching_rules():
    reg = CallRegistry()
    # 1. exact provider id
    a = await reg.create_session("+46701", "+46760", provider_call_id="leg_a")
    found, created = await reg.bind_realtime_leg("leg_a", "+46701", "+46769")
    assert found is a and not created

    # 2. different leg id, matched by caller number among pending sessions
    b = await reg.create_session("+46702", "+46760", provider_call_id="leg_b")
    c = await reg.create_session("+46703", "+46760", provider_call_id="leg_c")
    found, created = await reg.bind_realtime_leg("rt_x", "+46703", "+46769")
    assert found is c and not created
    assert await reg.get_by_provider_id("rt_x") is c

    # 3. unknown caller but exactly one pending session left -> that one
    found, created = await reg.bind_realtime_leg("rt_y", "anonymous", "+46769")
    assert found is b and not created

    # 4. nothing pending -> new session (direct call to the websocket number)
    found, created = await reg.bind_realtime_leg("rt_z", "+46704", "+46769")
    assert created and found.caller == "+46704"


@pytest.mark.asyncio
async def test_bind_reclaims_session_hung_up_before_audio_leg():
    reg = CallRegistry()
    session = await reg.create_session("+46705", "+46760", provider_call_id="voice_1")
    session.close_on_connect = True
    await session.set_status(CallStatus.ENDED, reason="assistant_hangup_before_connect")

    found, created = await reg.bind_realtime_leg("rt_late", "+46705", "+46769")
    assert found is session and not created
    assert session.realtime_call_id == "rt_late"


@pytest.mark.asyncio
async def test_bind_does_not_reclaim_old_ended_call_from_same_number():
    reg = CallRegistry()
    old = await reg.create_session("+46705", "+46760", provider_call_id="old")
    await old.set_status(CallStatus.ENDED)
    old.ended_at -= timedelta(minutes=10)

    found, created = await reg.bind_realtime_leg("rt_new", "+46705", "+46769")
    assert created and found is not old


@pytest.mark.asyncio
async def test_expire_stale_sessions():
    reg = CallRegistry()
    stuck = await reg.create_session("+46701", "+46760", provider_call_id="stuck")
    stuck.started_at -= timedelta(seconds=500)
    old = await reg.create_session("+46702", "+46760", provider_call_id="old")
    await old.set_status(CallStatus.ENDED)
    old.ended_at -= timedelta(hours=3)
    fresh = await reg.create_session("+46703", "+46760")

    failed = await reg.expire_stale(pending_max_age_seconds=120, ended_retention_seconds=3600)
    assert failed == [stuck]
    assert stuck.status == CallStatus.FAILED
    assert await reg.get_by_id(old.call_id) is None
    assert await reg.get_by_provider_id("old") is None
    assert await reg.get_by_id(fresh.call_id) is fresh
