import pytest
from httpx import AsyncClient, ASGITransport
from grokcall.api.app import app
from grokcall.core.registry import registry
from grokcall.core.models import CallStatus
from grokcall.core.config import settings


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_incoming_webhook():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "callid": "c_webhook_1",
            "direction": "incoming",
            "from": "+46701234567",
            "to": "+46766861234",
        }
        res = await client.post("/46elks/incoming", data=payload)
        assert res.status_code == 200
        data = res.json()
        assert "play" in data
        assert "next" in data
        assert "connect" in data["next"]

        # Check registry
        session = await registry.get_by_provider_id("c_webhook_1")
        assert session is not None
        assert session.caller == "+46701234567"
        assert session.status == CallStatus.WAITING


@pytest.mark.asyncio
async def test_mcp_auth_protection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Without auth header
        res = await client.post("/mcp", json={})
        assert res.status_code == 401

        # With incorrect auth header
        res = await client.post("/mcp", json={}, headers={"Authorization": "Bearer wrong-token"})
        assert res.status_code == 401
