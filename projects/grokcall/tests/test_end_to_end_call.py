"""Whole-system test: the real ASGI server, a fake 46elks peer speaking the real
realtime WebSocket protocol, and the real MCP client acting as the Grok Bot.

Everything runs in one event loop so the test can also poke the fake STT to
"transcribe" what the caller says.
"""

import asyncio
import base64
import json
import socket
from typing import Any, Dict

import httpx
import pytest
import uvicorn
import websockets
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from grokcall.api.app import app
from grokcall.core.models import CallStatus
from grokcall.core.registry import registry


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class RunningServer:
    def __init__(self, port: int):
        self.port = port
        self.base = f"http://127.0.0.1:{port}"
        self.ws_base = f"ws://127.0.0.1:{port}"
        self._server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="on"))
        self._task: asyncio.Task | None = None

    async def __aenter__(self):
        self._task = asyncio.create_task(self._server.serve())
        for _ in range(100):
            if self._server.started:
                return self
            await asyncio.sleep(0.05)
        raise RuntimeError("server did not start")

    async def __aexit__(self, *exc):
        self._server.should_exit = True
        await asyncio.wait_for(self._task, timeout=10)


class GrokBotClient:
    """The Grok Bot's view of the world: only the MCP tools."""

    def __init__(self, base: str, token: str):
        self._http = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=60)
        self._cm = streamable_http_client(f"{base}/mcp", http_client=self._http)
        self.session: ClientSession | None = None

    async def __aenter__(self):
        streams = await self._cm.__aenter__()
        self._session_cm = ClientSession(streams[0], streams[1])
        self.session = await self._session_cm.__aenter__()
        await self.session.initialize()
        return self

    async def __aexit__(self, *exc):
        await self._session_cm.__aexit__(*exc)
        await self._cm.__aexit__(*exc)
        await self._http.aclose()

    async def call(self, tool: str, **args: Any) -> Dict[str, Any]:
        result = await self.session.call_tool(tool, args)
        assert not result.is_error, result.content
        if result.structured_content is not None:
            sc = result.structured_content
            return sc["result"] if set(sc) == {"result"} else sc
        return json.loads(result.content[0].text)


@pytest.mark.asyncio
async def test_full_call_through_real_server_and_mcp_client(test_settings):
    async with RunningServer(free_port()) as srv:
        # ---- 1. 46elks: unanswered call reaches the voice number ----------------
        async with httpx.AsyncClient(base_url=srv.base) as http:
            res = await http.post(
                "/46elks/incoming",
                data={"callid": "c_voice_leg", "direction": "incoming", "from": "+46709876543", "to": "+46766861234"},
            )
            assert res.status_code == 200
            assert res.json() == {"connect": test_settings.fortysixelks_realtime_number}

        session = await registry.get_by_provider_id("c_voice_leg")
        call_id = session.call_id

        async with GrokBotClient(srv.base, test_settings.mcp_bearer_token) as grok:
            tools = {t.name for t in (await grok.session.list_tools()).tools}
            assert tools == {
                "get_active_calls", "get_call", "wait_for_next_utterance",
                "speak", "interrupt_speech", "take_message", "hang_up",
            }

            # ---- 2. Grok wakes (via Slack in production) and looks at the call ----
            active = await grok.call("get_active_calls")
            assert [c["call_id"] for c in active] == [call_id]
            info = await grok.call("get_call", call_id=call_id)
            assert info["caller"] == "+46709876543"
            assert info["status"] in ("waiting", "waking_agent")

            # Greeting before the audio leg exists is queued, not lost.
            res = await grok.call("speak", call_id=call_id, text="Hej! Jag är Patriks AI-assistent. Hur kan jag hjälpa dig?", language="sv")
            assert res["status"] == "queued"

            # ---- 3. 46elks connects the realtime leg (a *different* call id) -------
            async with websockets.connect(f"{srv.ws_base}/46elks/realtime") as elks:
                await elks.send(json.dumps({"t": "hello", "callid": "c_realtime_leg", "from": "+46709876543", "to": test_settings.fortysixelks_realtime_number}))
                assert json.loads(await elks.recv()) == {"t": "listening", "format": "ulaw"}
                assert json.loads(await elks.recv()) == {"t": "sending", "format": "ulaw"}

                # queued greeting is played: 3 fake audio frames
                frames = [json.loads(await elks.recv()) for _ in range(3)]
                assert all(f["t"] == "audio" for f in frames)
                assert base64.b64decode(frames[0]["data"]) == b"\xff" * 160

                session = await registry.get_by_id(call_id)
                assert session.status == CallStatus.LIVE
                assert session.realtime_call_id == "c_realtime_leg"

                # ---- 4. caller speaks (English) while Grok long-polls ---------------
                waiter = asyncio.create_task(grok.call("wait_for_next_utterance", call_id=call_id, after_turn=1, timeout_seconds=10))
                await asyncio.sleep(0.2)
                await elks.send(json.dumps({"t": "audio", "data": base64.b64encode(b"\x00" * 160).decode()}))
                await asyncio.sleep(0.05)
                assert session.pipeline.stt.pushed_audio == [b"\x00" * 160]
                await session.pipeline.stt.simulate_committed("Hi, is Patrik available tomorrow afternoon?", "eng")

                event = await asyncio.wait_for(waiter, timeout=5)
                assert event == {"event": "utterance", "turn": 2, "text": "Hi, is Patrik available tomorrow afternoon?", "language": "en"}

                # ---- 5. Grok answers in English; audio reaches the caller -----------
                res = await grok.call("speak", call_id=call_id, text="I can check whether he appears to be available. What time did you have in mind?", language="en")
                assert res["status"] == "speaking"
                frames = [json.loads(await elks.recv()) for _ in range(3)]
                assert all(f["t"] == "audio" for f in frames)

                # ---- 6. silence -> timeout event, Grok just polls again --------------
                event = await grok.call("wait_for_next_utterance", call_id=call_id, after_turn=2, timeout_seconds=0.2)
                assert event == {"event": "timeout", "latest_turn": 3}

                # ---- 7. caller leaves a message ---------------------------------------
                await session.pipeline.stt.simulate_committed("Around three. Please ask him to call Johan back.", "eng")
                event = await grok.call("wait_for_next_utterance", call_id=call_id, after_turn=3, timeout_seconds=5)
                assert event["event"] == "utterance" and event["turn"] == 4
                res = await grok.call("take_message", call_id=call_id, caller_name="Johan", message="Call back tomorrow around 15:00", callback_requested=True)
                assert res["status"] == "saved"

                # ---- 8. Grok hangs up with final words --------------------------------
                res = await grok.call("hang_up", call_id=call_id, final_words="Thank you, I will pass that on. Goodbye!")
                assert res["status"] == "ended"

                # the final words are streamed, then bye; the socket stays open until
                # the provider confirms with its own bye
                seen = [json.loads(await elks.recv()) for _ in range(4)]
                assert [m["t"] for m in seen] == ["audio", "audio", "audio", "bye"]
                await elks.send(json.dumps({"t": "bye", "reason": "hangup", "message": "call ended"}))
                await asyncio.sleep(0.1)

            assert session.status == CallStatus.ENDED
            assert session.handled_by == "grok"
            assert [t.speaker.value for t in session.turns] == ["assistant", "caller", "assistant", "caller", "assistant"]
            assert len(session.messages) == 1 and session.messages[0].caller_name == "Johan"
            assert session.timings.grok_first_mcp_call_at is not None
            assert session.timings.realtime_connected_at is not None

            # the finished call is in SQLite
            from grokcall.api import app as app_module
            stored = app_module.database.get_call(call_id)
            assert stored["status"] == "ended" and stored["handled_by"] == "grok"
            assert len(stored["turns"]) == 5 and len(stored["messages"]) == 1

            # ended calls are reported as such to a late poller
            event = await grok.call("wait_for_next_utterance", call_id=call_id, after_turn=4, timeout_seconds=5)
            assert event["event"] == "call_ended"


@pytest.mark.asyncio
async def test_caller_hangs_up_mid_call(test_settings):
    async with RunningServer(free_port()) as srv:
        async with websockets.connect(f"{srv.ws_base}/46elks/realtime") as elks:
            # direct call to the websocket number, no prior webhook
            await elks.send(json.dumps({"t": "hello", "callid": "c_direct", "from": "+46700000001", "to": "+46766860099"}))
            await elks.recv(); await elks.recv()
            session = await registry.get_by_provider_id("c_direct")
            assert session is not None and session.status == CallStatus.LIVE
            # connecting line is spoken because no clip is configured
            assert (json.loads(await elks.recv()))["t"] == "audio"

            await elks.send(json.dumps({"t": "bye", "reason": "hangup", "message": "the caller hung up"}))
            await asyncio.sleep(0.1)

        assert session.status == CallStatus.ENDED
        assert session.end_reason == "hangup"


@pytest.mark.asyncio
async def test_realtime_path_token_enforced(test_settings):
    test_settings.realtime_path_token = "s3cret"
    rejected = (websockets.ConnectionClosed, websockets.InvalidStatus)
    async with RunningServer(free_port()) as srv:
        with pytest.raises(rejected):
            async with websockets.connect(f"{srv.ws_base}/46elks/realtime") as ws:
                await ws.recv()
        with pytest.raises(rejected):
            async with websockets.connect(f"{srv.ws_base}/46elks/realtime/wrong") as ws:
                await ws.recv()
        async with websockets.connect(f"{srv.ws_base}/46elks/realtime/s3cret") as ws:
            await ws.send(json.dumps({"t": "hello", "callid": "c_tok", "from": "+4670", "to": "+4676"}))
            assert json.loads(await ws.recv())["t"] == "listening"
            await ws.send(json.dumps({"t": "bye", "reason": "hangup"}))


@pytest.mark.asyncio
async def test_mcp_rejects_bad_token_at_transport_level(test_settings):
    async with RunningServer(free_port()) as srv:
        http = httpx.AsyncClient(headers={"Authorization": "Bearer nope"})
        with pytest.raises(Exception):
            async with streamable_http_client(f"{srv.base}/mcp", http_client=http) as streams:
                async with ClientSession(streams[0], streams[1]) as s:
                    await asyncio.wait_for(s.initialize(), timeout=5)
        await http.aclose()
