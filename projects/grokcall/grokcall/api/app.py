import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any

from fastapi import (
    FastAPI,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    Depends,
    Form,
    status,
)
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware

from grokcall.core.config import settings
from grokcall.core.registry import registry
from grokcall.core.models import CallStatus
from grokcall.core.pipeline import CallPipeline
from grokcall.adapters.fortysixelks.telephony import (
    FortySixElksActionBuilder,
    FortySixElksWebSocketLeg,
)
from grokcall.adapters.elevenlabs.stt import ElevenLabsScribeSTT
from grokcall.adapters.elevenlabs.tts import ElevenLabsFlashTTS
from grokcall.adapters.slack_wake import SlackWakeNotifier
from grokcall.adapters.fakes import FakeSTT, FakeTTS
from grokcall.api.mcp_server import mcp_server

logger = logging.getLogger("grokcall.api")
logging.basicConfig(level=logging.INFO)

bearer_scheme = HTTPBearer(auto_error=False)


async def verify_mcp_auth(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    """Enforce Bearer token authentication on the MCP endpoint."""
    if not settings.mcp_bearer_token:
        return True
    if not credentials or credentials.credentials != settings.mcp_bearer_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting GrokCall Phone Gateway")
    yield
    logger.info("Shutting down GrokCall Phone Gateway")


app = FastAPI(
    title="GrokCall Phone Gateway",
    version="1.0.0",
    lifespan=lifespan,
)

wake_notifier = SlackWakeNotifier(webhook_url=settings.slack_webhook_url)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "active_calls": len(await registry.list_active()),
    }


@app.post("/46elks/incoming")
async def fortysixelks_incoming(
    callid: str = Form(...),
    direction: str = Form("incoming"),
    to: str = Form(...),
    from_: str = Form(..., alias="from"),
):
    """46elks incoming call webhook.

    1. Creates CallSession in WAITING state.
    2. Sends asynchronous Slack wake event.
    3. Returns call actions (play connecting.mp3 -> connect to realtime number).
    """
    logger.info(f"Incoming call {callid} from {from_} to {to}")

    session = await registry.create_session(
        caller=from_,
        called=to,
        provider_call_id=callid,
    )
    await session.set_status(CallStatus.WAITING)

    # Trigger Slack wake event in background
    asyncio.create_task(
        wake_notifier.notify_call_started(
            call_id=session.call_id,
            caller=from_,
            called=to,
        )
    )

    # Build action: play connecting message then route to realtime WebSocket number
    realtime_target = settings.fortysixelks_realtime_number or to
    connecting_url = settings.fortysixelks_connecting_audio_url or f"{settings.base_url}/static/connecting.mp3"

    actions = FortySixElksActionBuilder.play_and_connect(
        play_url=connecting_url,
        connect_to=realtime_target,
    )
    return JSONResponse(content=actions)


@app.post("/46elks/hangup")
async def fortysixelks_hangup(
    callid: str = Form(...),
    duration: Optional[str] = Form(None),
    result: Optional[str] = Form(None),
):
    """46elks hangup status callback."""
    logger.info(f"46elks hangup event for callid={callid}, result={result}, duration={duration}")
    session = await registry.get_by_provider_id(callid)
    if session:
        if session.pipeline:
            await session.pipeline.hangup()
        else:
            await session.set_status(CallStatus.ENDED)
    return PlainTextResponse("OK")


@app.websocket("/46elks/realtime")
async def fortysixelks_realtime_websocket(websocket: WebSocket):
    """46elks Realtime Voice WebSocket endpoint."""
    await websocket.accept()

    try:
        # Step 1: Wait for 46elks 'hello' message
        raw_hello = await websocket.receive_text()
        hello_msg = json.loads(raw_hello)
        if hello_msg.get("t") != "hello":
            logger.error(f"Expected hello message, got: {hello_msg}")
            await websocket.close()
            return

        callid = hello_msg.get("callid", "")
        caller = hello_msg.get("from", "")
        called = hello_msg.get("to", "")
        logger.info(f"Realtime WS hello from {caller} to {called} (callid={callid})")

        # Find or create session
        session = await registry.get_by_provider_id(callid)
        if not session:
            session = await registry.create_session(
                caller=caller,
                called=called,
                provider_call_id=callid,
            )

        # Step 2: Establish Leg and negotiate formats
        leg = FortySixElksWebSocketLeg(websocket, callid=callid, caller=caller, called=called)
        await leg.setup_audio_session()

        # Step 3: Instantiate STT and TTS engines
        if settings.elevenlabs_api_key:
            stt = ElevenLabsScribeSTT(api_key=settings.elevenlabs_api_key)
            tts = ElevenLabsFlashTTS(api_key=settings.elevenlabs_api_key, voice_id=settings.elevenlabs_voice_id)
        else:
            logger.warning("No ElevenLabs API key found. Using test fakes for STT/TTS.")
            stt = FakeSTT()
            tts = FakeTTS()

        pipeline = CallPipeline(
            session=session,
            telephony=leg,
            stt=stt,
            tts=tts,
            hold_timeout_seconds=settings.grok_wake_timeout_seconds,
            fallback_timeout_seconds=settings.fallback_timeout_seconds,
        )
        await pipeline.start()

        # Step 4: Stream audio and handle incoming messages
        while True:
            raw_msg = await websocket.receive_text()
            msg = json.loads(raw_msg)
            msg_type = msg.get("t")

            if msg_type == "audio":
                audio_b64 = msg.get("data", "")
                if audio_b64:
                    raw_audio = base64.b64decode(audio_b64)
                    await pipeline.on_caller_audio_chunk(raw_audio)

            elif msg_type == "bye":
                logger.info(f"46elks sent bye: {msg.get('message', 'caller hung up')}")
                await pipeline.hangup()
                break

    except WebSocketDisconnect:
        logger.info("Realtime WS disconnected.")
    except Exception as e:
        logger.error(f"Realtime WS error: {e}")
    finally:
        if 'session' in locals() and session:
            await session.set_status(CallStatus.ENDED)


# MCP Streamable HTTP App Integration
# The mcp_server exposes streamable_http_app mounted at /mcp
mcp_asgi_app = mcp_server.streamable_http_app(streamable_http_path="/")


class MCPAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/mcp"):
            auth = request.headers.get("Authorization")
            if settings.mcp_bearer_token:
                expected = f"Bearer {settings.mcp_bearer_token}"
                if auth != expected:
                    return JSONResponse(
                        status_code=401,
                        content={"error": "Unauthorized MCP access"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
        return await call_next(request)


app.add_middleware(MCPAuthMiddleware)
app.mount("/mcp", mcp_asgi_app)
