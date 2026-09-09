import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from grokcall.api.app import app
from grokcall.core.models import CallStatus
from grokcall.core.registry import registry


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_incoming_connects_directly_when_no_clip_configured(client, test_settings):
    res = await client.post(
        "/46elks/incoming",
        data={"callid": "c_webhook_1", "direction": "incoming", "from": "+46701234567", "to": "+46766861234"},
    )
    assert res.status_code == 200
    assert res.json() == {
        "connect": "+46766860099",
        "whenhangup": f"{test_settings.base_url}/46elks/hangup",
    }

    session = await registry.get_by_provider_id("c_webhook_1")
    assert session is not None and session.caller == "+46701234567"
    assert session.status in (CallStatus.WAITING, CallStatus.WAKING_AGENT)


@pytest.mark.asyncio
async def test_incoming_plays_clip_then_connects(client, test_settings):
    test_settings.connecting_audio_url = "https://phone.example.com/static/connecting.mp3"
    res = await client.post("/46elks/incoming", data={"callid": "c_clip", "from": "+4670", "to": "+4676"})
    assert res.json() == {
        "play": "https://phone.example.com/static/connecting.mp3",
        "whenhangup": f"{test_settings.base_url}/46elks/hangup",
        "next": {
            "connect": "+46766860099",
            "whenhangup": f"{test_settings.base_url}/46elks/hangup",
        },
    }


@pytest.mark.asyncio
async def test_incoming_rejects_when_realtime_number_missing(client, test_settings):
    test_settings.fortysixelks_realtime_number = None
    res = await client.post("/46elks/incoming", data={"callid": "c_norn", "from": "+4670", "to": "+4676"})
    assert res.status_code == 200
    assert res.json() == {"hangup": "busy"}
    assert await registry.get_by_provider_id("c_norn") is None


@pytest.mark.asyncio
async def test_hangup_callback_is_lenient_and_ends_pending_call(client):
    await client.post("/46elks/incoming", data={"callid": "c_hang", "from": "+4670", "to": "+4676"})
    # whenhangup identifies the call as "id" and carries other fields we ignore
    res = await client.post("/46elks/hangup", data={"id": "c_hang", "state": "success", "duration": "3"})
    assert res.status_code == 200
    session = await registry.get_by_provider_id("c_hang")
    assert session.status == CallStatus.ENDED

    # unknown / malformed payloads still get a 2xx so 46elks does not retry for hours
    res = await client.post("/46elks/hangup", data={"state": "failed"})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_hangup_callback_does_not_kill_live_call_for_voice_leg_id(client):
    await client.post("/46elks/incoming", data={"callid": "c_voice", "from": "+4670", "to": "+4676"})
    session = await registry.get_by_provider_id("c_voice")
    session.realtime_call_id = "c_rt"
    registry._provider_map["c_rt"] = session.call_id
    from grokcall.adapters.fakes import FakeSTT, FakeTelephonyLeg, FakeTTS
    from grokcall.core.pipeline import CallPipeline
    pipeline = CallPipeline(session, FakeTelephonyLeg(), FakeSTT(), FakeTTS(delay_per_chunk=0.0))
    await pipeline.start()
    assert session.status == CallStatus.LIVE

    res = await client.post("/46elks/hangup", data={"id": "c_voice", "state": "success"})
    assert res.status_code == 200
    assert session.status == CallStatus.LIVE
    await pipeline.hangup()


@pytest.mark.asyncio
async def test_mcp_requires_bearer_token(client):
    assert (await client.post("/mcp", json={})).status_code == 401
    assert (await client.post("/mcp", json={}, headers={"Authorization": "Bearer wrong"})).status_code == 401
    assert (await client.post("/mcp", json={}, headers={"Authorization": "Basic dGVzdC10b2tlbg=="})).status_code == 401
    # the health endpoint is not behind the token
    assert (await client.get("/health")).status_code == 200


@pytest.mark.asyncio
async def test_mcp_fails_closed_without_token(client, test_settings):
    test_settings.mcp_bearer_token = ""
    res = await client.post("/mcp", json={})
    assert res.status_code == 503
    assert res.json() == {"error": "mcp_auth_not_configured"}
