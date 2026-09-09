import pytest
from grokcall.core.language import detect_language
from grokcall.core.models import CallStatus, Speaker, CallTimings
from grokcall.core.registry import CallRegistry, CallSession
from datetime import datetime, timezone, timedelta
import asyncio


def test_language_detection():
    # Swedish phrases
    assert detect_language("Hej! Patrik kunde inte svara just nu.") == "sv"
    assert detect_language("Tjena, Johan här. Kan han ringa mig senare?") == "sv"
    assert detect_language("Jag vill lämna ett meddelande om projektet.") == "sv"

    # English phrases
    assert detect_language("Hi, is Patrik available tomorrow afternoon?") == "en"
    assert detect_language("Hello! I would like to leave a message please.") == "en"
    assert detect_language("Can you ask him to call me back?") == "en"

    # Edge cases
    assert detect_language("", default="sv") == "sv"
    assert detect_language("12345", default="sv") == "sv"


@pytest.mark.asyncio
async def test_call_session_turns_and_latencies():
    session = CallSession("call_123", "+46701111111", "+46766860000")
    assert session.status == CallStatus.WAITING

    # Add caller turn
    t1 = await session.add_caller_turn("Hej, kan jag lämna ett meddelande?")
    assert t1.turn_number == 1
    assert t1.speaker == Speaker.CALLER
    assert t1.language == "sv"

    # Add assistant turn
    t2 = await session.add_assistant_turn("Absolut, vad gäller det?", "sv")
    assert t2.turn_number == 2
    assert t2.speaker == Speaker.ASSISTANT

    # Timings
    session.timings.tts_first_audio_at = datetime.now(timezone.utc)
    latencies = session.timings.compute_latencies()
    assert "total_turn_latency_ms" in latencies
    assert latencies["total_turn_latency_ms"] >= 0


@pytest.mark.asyncio
async def test_call_session_long_polling():
    session = CallSession("call_poll", "+46701111111", "+46766860000")

    async def add_delayed_turn():
        await asyncio.sleep(0.05)
        await session.add_caller_turn("Hello from caller")

    asyncio.create_task(add_delayed_turn())
    turn = await session.wait_for_turn(after_turn=0, timeout_seconds=1.0)
    assert turn is not None
    assert turn.text == "Hello from caller"
    assert turn.language == "en"


@pytest.mark.asyncio
async def test_registry_lookup():
    reg = CallRegistry()
    s = await reg.create_session("+4670111", "+4676686", provider_call_id="c_elks_99")
    assert s.call_id.startswith("call_")

    found_by_id = await reg.get_by_id(s.call_id)
    assert found_by_id is s

    found_by_provider = await reg.get_by_provider_id("c_elks_99")
    assert found_by_provider is s
