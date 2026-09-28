import logging

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from grokcall.api.app import app
from grokcall.core.models import CallStatus
from grokcall.core.registry import registry


def _whenhangup(test_settings) -> str:
    return f"{test_settings.base_url}/46elks/hangup?token={test_settings.fortysixelks_hangup_token}"


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
        "whenhangup": _whenhangup(test_settings),
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
        "whenhangup": _whenhangup(test_settings),
        "next": {
            "connect": "+46766860099",
            "whenhangup": _whenhangup(test_settings),
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
async def test_hangup_before_websocket_leaves_connecting_call_open(client, test_settings):
    await client.post("/46elks/incoming", data={"callid": "c_hang", "from": "+4670", "to": "+4676"})
    # whenhangup identifies the call as "id" and can arrive before the realtime socket.
    res = await client.post(
        "/46elks/hangup",
        params={"token": test_settings.fortysixelks_hangup_token},
        data={"id": "c_hang", "state": "success", "duration": "3"},
    )
    assert res.status_code == 200
    session = await registry.get_by_provider_id("c_hang")
    assert session is not None
    assert not session.is_terminal
    assert session.end_reason is None

    # unknown / malformed payloads still get a 2xx so 46elks does not retry for hours
    res = await client.post(
        "/46elks/hangup",
        params={"token": test_settings.fortysixelks_hangup_token},
        data={"state": "failed"},
    )
    assert res.status_code == 200
    assert not session.is_terminal


@pytest.mark.asyncio
async def test_hangup_callback_requires_shared_token(client, test_settings, caplog):
    token = "super-secret-hangup-token"
    test_settings.fortysixelks_hangup_token = token
    res = await client.post("/46elks/incoming", data={"callid": "c_auth", "from": "+4670", "to": "+4676"})
    assert res.status_code == 200
    assert res.json()["whenhangup"] == f"{test_settings.base_url}/46elks/hangup?token={token}"

    caplog.set_level(logging.DEBUG, logger="grokcall")
    missing = await client.post("/46elks/hangup", data={"id": "c_auth", "state": "success"})
    wrong = await client.post(
        "/46elks/hangup",
        params={"token": "not-the-secret"},
        data={"id": "c_auth", "state": "success"},
    )
    assert missing.status_code == 403
    assert wrong.status_code == 403
    session = await registry.get_by_provider_id("c_auth")
    assert session is not None and not session.is_terminal

    ok = await client.post(
        "/46elks/hangup",
        params={"token": token},
        data={"id": "c_auth", "state": "success"},
    )
    assert ok.status_code == 200
    assert not session.is_terminal

    logged = "\n".join(record.getMessage() for record in caplog.records if record.name.startswith("grokcall"))
    assert token not in logged
    assert "not-the-secret" not in logged


@pytest.mark.asyncio
async def test_hangup_rejects_when_secret_is_unconfigured(client, test_settings):
    test_settings.fortysixelks_hangup_token = None
    res = await client.post("/46elks/incoming", data={"callid": "c_open", "from": "+4670", "to": "+4676"})
    assert res.json()["whenhangup"] == f"{test_settings.base_url}/46elks/hangup"
    denied = await client.post("/46elks/hangup", params={"token": "anything"}, data={"id": "c_open"})
    assert denied.status_code == 403
    session = await registry.get_by_provider_id("c_open")
    assert session is not None and not session.is_terminal


def test_hangup_token_is_redacted_from_log_records():
    token = "super-secret-hangup-token"
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("127.0.0.1", "POST", f"/46elks/hangup?token={token}&x=1", "1.1", 200),
        exc_info=None,
    )
    access_log = logging.getLogger("uvicorn.access")
    assert access_log.filters
    assert access_log.filter(record)
    rendered = record.getMessage()
    assert token not in rendered
    assert "token=REDACTED" in rendered
    assert "&x=1" in rendered


@pytest.mark.asyncio
async def test_hangup_callback_url_roundtrips_reserved_characters(client, test_settings):
    from urllib.parse import parse_qs, urlsplit

    test_settings.fortysixelks_hangup_token = "a+b/c="
    res = await client.post("/46elks/incoming", data={"callid": "c_enc", "from": "+4670", "to": "+4676"})
    url = res.json()["whenhangup"]
    assert "a+b/c=" not in url
    assert parse_qs(urlsplit(url).query)["token"] == ["a+b/c="]
    ok = await client.post("/46elks/hangup", params={"token": "a+b/c="}, data={"id": "c_enc", "state": "success"})
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_hangup_callback_does_not_kill_live_call_for_voice_leg_id(client, test_settings):
    await client.post("/46elks/incoming", data={"callid": "c_voice", "from": "+4670", "to": "+4676"})
    session = await registry.get_by_provider_id("c_voice")
    session.realtime_call_id = "c_rt"
    registry._provider_map["c_rt"] = session.call_id
    from grokcall.adapters.fakes import FakeSTT, FakeTelephonyLeg, FakeTTS
    from grokcall.core.pipeline import CallPipeline
    pipeline = CallPipeline(session, FakeTelephonyLeg(), FakeSTT(), FakeTTS(delay_per_chunk=0.0))
    await pipeline.start()
    assert session.status == CallStatus.LIVE

    res = await client.post(
        "/46elks/hangup",
        params={"token": test_settings.fortysixelks_hangup_token},
        data={"id": "c_voice", "state": "success"},
    )
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
