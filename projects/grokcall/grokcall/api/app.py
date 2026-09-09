import asyncio
import base64
import json
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from mcp.server.transport_security import TransportSecuritySettings
from starlette.types import ASGIApp, Receive, Scope, Send

from grokcall.adapters.elevenlabs.stt import ElevenLabsScribeSTT
from grokcall.adapters.elevenlabs.tts import ElevenLabsFlashTTS
from grokcall.adapters.fakes import FakeSTT, FakeTTS
from grokcall.adapters.fortysixelks.telephony import (
    FortySixElksActionBuilder,
    FortySixElksWebSocketLeg,
    parse_hangup_form,
    parse_incoming_form,
)
from grokcall.adapters.slack_wake import SlackWakeNotifier
from grokcall.api.mcp_server import mcp_server
from grokcall.core.config import settings
from grokcall.core.models import CallStatus
from grokcall.core.pipeline import CallPipeline
from grokcall.core.ports import SpeechToTextPort, TextToSpeechPort
from grokcall.core.registry import CallSession, registry
from grokcall.persistence.database import Database

logger = logging.getLogger("grokcall.api")
logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)

ASSETS_DIR = Path(__file__).resolve().parents[2] / "assets"


# ----------------------------------------------------------------- persistence

database: Optional[Database] = None


async def persist_session(session: CallSession) -> None:
    if database is None:
        return
    try:
        await asyncio.to_thread(database.save_session, session)
    except Exception:  # noqa: BLE001 - persistence must never take down a call
        logger.exception("Failed to persist call %s", session.call_id)


async def sweep_stale_sessions() -> None:
    while True:
        await asyncio.sleep(30)
        try:
            failed = await registry.expire_stale(
                pending_max_age_seconds=settings.pending_call_expiry_seconds,
                ended_retention_seconds=settings.ended_call_retention_seconds,
            )
            for session in failed:
                logger.warning("Call %s never went live; marked failed", session.call_id)
                await persist_session(session)
        except Exception:  # noqa: BLE001
            logger.exception("Session sweep failed")


# ------------------------------------------------------------------ lifespan

@asynccontextmanager
async def lifespan(app: FastAPI):
    global database
    logger.info("GrokCall gateway starting (env=%s)", settings.app_env)
    if not settings.fortysixelks_realtime_number:
        logger.error("FORTYSIXELKS_REALTIME_NUMBER is not set; incoming calls will be rejected")
    if not settings.elevenlabs_api_key:
        logger.warning("ELEVENLABS_API_KEY not set; using fake STT/TTS (development only)")
    database = Database(settings.sqlite_db_path)
    sweeper = asyncio.create_task(sweep_stale_sessions())
    # The MCP streamable-HTTP transport needs its session manager running for the
    # lifetime of the app; mounting the sub-app alone does not start it, and a
    # manager can only run once, so both are created here per startup.
    mcp_mount.target = build_mcp_asgi_app()
    try:
        async with mcp_server.session_manager.run():
            yield
    finally:
        mcp_mount.target = None
        sweeper.cancel()
        logger.info("GrokCall gateway stopped")


app = FastAPI(title="GrokCall Phone Gateway", version="1.0.0", lifespan=lifespan)

wake_notifier = SlackWakeNotifier(webhook_url=settings.slack_webhook_url)
_background_tasks: set = set()


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# ------------------------------------------------------------------- health

@app.get("/health")
async def health():
    return {"status": "ok", "active_calls": len(await registry.list_active())}


# ------------------------------------------------------------ 46elks webhooks

async def _wake_agent(session: CallSession) -> None:
    ok = await wake_notifier.notify_call_started(session.call_id, session.caller, session.called)
    if ok:
        session.timings.slack_event_sent_at = datetime.now(timezone.utc)
        # The realtime leg may already have moved the call on; never step back.
        if session.status == CallStatus.WAITING:
            await session.set_status(CallStatus.WAKING_AGENT)
    else:
        logger.error("Wake signal failed for %s; fallback assistant will handle the call", session.call_id)


@app.post("/46elks/incoming")
async def fortysixelks_incoming(request: Request):
    """voice_start webhook. Registers the call, fires the wake signal, and answers
    with the actions that bridge the caller into the realtime WebSocket number."""
    form = await request.form()
    incoming = parse_incoming_form(form)
    logger.info("Incoming call %s from %s to %s", incoming.callid, incoming.caller, incoming.called)

    if not settings.fortysixelks_realtime_number:
        return JSONResponse(FortySixElksActionBuilder.hangup("busy"))

    session = await registry.create_session(
        caller=incoming.caller,
        called=incoming.called,
        provider_call_id=incoming.callid,
        default_language=settings.default_language,
    )
    _spawn(_wake_agent(session))

    if settings.connecting_audio_url:
        actions = FortySixElksActionBuilder.play_then_connect(
            settings.connecting_audio_url, settings.fortysixelks_realtime_number
        )
    else:
        actions = FortySixElksActionBuilder.connect(settings.fortysixelks_realtime_number)
    return JSONResponse(actions)


@app.post("/46elks/hangup")
async def fortysixelks_hangup(request: Request):
    """whenhangup callback for the voice number. The realtime leg normally ends the
    call first; this is a safety net for legs that never connected."""
    form = await request.form()
    provider_id = parse_hangup_form(form)
    logger.info("Hangup callback for %s (state=%s)", provider_id, form.get("state"))
    if provider_id:
        session = await registry.get_by_provider_id(provider_id)
        if session is not None and not session.is_terminal:
            if session.pipeline is not None:
                # Once the realtime WebSocket is up, that leg owns teardown. The
                # original voice number's whenhangup can fire when the *connect*
                # action completes, which must not kill a live conversation.
                if session.realtime_call_id and provider_id != session.realtime_call_id:
                    logger.info(
                        "Ignoring voice-leg hangup for live call %s (realtime=%s)",
                        session.call_id,
                        session.realtime_call_id,
                    )
                else:
                    await session.pipeline.on_leg_closed(reason="provider_hangup_callback")
            else:
                await session.set_status(CallStatus.ENDED, reason="hangup_before_connect")
                await persist_session(session)
    return PlainTextResponse("OK")


# -------------------------------------------------------- 46elks realtime leg

def build_speech_providers() -> Tuple[SpeechToTextPort, TextToSpeechPort]:
    if not settings.elevenlabs_api_key:
        return FakeSTT(), FakeTTS()
    secondary = [s.strip() for s in settings.elevenlabs_stt_secondary_languages.split(",") if s.strip()]
    stt = ElevenLabsScribeSTT(
        api_key=settings.elevenlabs_api_key,
        base_url=settings.elevenlabs_stt_url,
        model_id=settings.elevenlabs_stt_model_id,
        language_code=settings.elevenlabs_stt_language,
        secondary_languages=secondary,
        vad_silence_threshold_secs=settings.elevenlabs_stt_vad_silence_secs,
    )
    tts = ElevenLabsFlashTTS(
        api_key=settings.elevenlabs_api_key,
        voice_id=settings.elevenlabs_voice_id,
        model_id=settings.elevenlabs_tts_model_id,
        base_url=settings.elevenlabs_tts_url,
    )
    return stt, tts


async def _realtime_session(websocket: WebSocket) -> None:
    await websocket.accept()
    session: Optional[CallSession] = None
    pipeline: Optional[CallPipeline] = None
    leg: Optional[FortySixElksWebSocketLeg] = None
    try:
        hello = json.loads(await websocket.receive_text())
        if hello.get("t") != "hello":
            logger.error("Realtime leg opened without hello: %s", hello)
            await websocket.close(code=1002)
            return

        callid, caller, called = hello.get("callid", ""), hello.get("from", ""), hello.get("to", "")
        session, created = await registry.bind_realtime_leg(
            callid, caller, called, default_language=settings.default_language
        )
        if created:
            logger.warning("Realtime leg %s had no pending session; created %s", callid, session.call_id)
            _spawn(_wake_agent(session))
        logger.info("Realtime leg %s bound to %s", callid, session.call_id)

        leg = FortySixElksWebSocketLeg(websocket, callid=callid, caller=caller, called=called)
        await leg.setup_audio_session()

        stt, tts = build_speech_providers()
        pipeline = CallPipeline(
            session=session,
            telephony=leg,
            stt=stt,
            tts=tts,
            owner_name=settings.assistant_owner_name,
            hold_timeout_seconds=settings.grok_hold_timeout_seconds,
            fallback_timeout_seconds=settings.grok_fallback_timeout_seconds,
            speak_connecting_line=not settings.connecting_audio_url,
            on_ended=persist_session,
        )
        await pipeline.start()

        while True:
            msg = json.loads(await websocket.receive_text())
            kind = msg.get("t")
            if kind == "audio":
                data = msg.get("data")
                if data:
                    await pipeline.on_caller_audio_chunk(base64.b64decode(data))
            elif kind == "bye":
                logger.info("Provider bye on %s: %s", callid, msg.get("message"))
                leg.mark_closed()
                await pipeline.on_leg_closed(reason=msg.get("reason") or "provider_bye")
                break
            elif kind == "sync":
                continue
            else:
                logger.debug("Ignoring realtime message type %r", kind)

    except WebSocketDisconnect:
        logger.info("Realtime socket disconnected")
    except Exception:  # noqa: BLE001
        logger.exception("Realtime leg failed")
    finally:
        if leg is not None:
            leg.mark_closed()
        if pipeline is not None:
            await pipeline.on_leg_closed(reason="socket_closed")
        elif session is not None and not session.is_terminal:
            await session.set_status(CallStatus.FAILED, reason="realtime_setup_failed")
            await persist_session(session)


@app.websocket("/46elks/realtime")
async def realtime_unprotected(websocket: WebSocket):
    if settings.realtime_path_token:
        # A token is configured, so only the tokenised path is valid.
        await websocket.close(code=1008)
        return
    await _realtime_session(websocket)


@app.websocket("/46elks/realtime/{token}")
async def realtime_with_token(websocket: WebSocket, token: str):
    expected = settings.realtime_path_token or ""
    if not expected or not secrets.compare_digest(token, expected):
        await websocket.close(code=1008)
        return
    await _realtime_session(websocket)


# ------------------------------------------------------------------ static

if ASSETS_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(ASSETS_DIR)), name="static")


# --------------------------------------------------------------------- MCP

class BearerAuthMiddleware:
    """Pure ASGI middleware (streaming-safe) requiring a bearer token on /mcp."""

    def __init__(self, app: ASGIApp, protected_prefix: str = "/mcp"):
        self.app = app
        self.protected_prefix = protected_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        token = settings.mcp_bearer_token
        if scope["type"] == "http" and scope["path"].startswith(self.protected_prefix) and token:
            header = next(
                (v.decode("latin-1") for k, v in scope["headers"] if k == b"authorization"), ""
            )
            scheme, _, presented = header.partition(" ")
            if scheme.lower() != "bearer" or not secrets.compare_digest(presented.strip(), token):
                response = JSONResponse(
                    status_code=401,
                    content={"error": "unauthorized"},
                    headers={"WWW-Authenticate": "Bearer"},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


app.add_middleware(BearerAuthMiddleware)


def build_mcp_asgi_app() -> ASGIApp:
    # Stateless + JSON responses keep the transport simple for the Grok Bot client:
    # every request is self-contained and long-polls return one JSON body. The
    # sub-app owns the "/mcp" path itself so there is no trailing-slash redirect.
    # DNS-rebinding protection is off because the SDK's default only allows
    # localhost Host headers; we sit behind a tunnel and require a bearer token.
    return mcp_server.streamable_http_app(
        streamable_http_path="/mcp",
        json_response=True,
        stateless_http=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        host=settings.host,
    )


class _MCPMount:
    """Forwards to the MCP ASGI app created for the current lifespan."""

    def __init__(self):
        self.target: Optional[ASGIApp] = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.target is None:
            response = JSONResponse(status_code=503, content={"error": "mcp_not_ready"})
            await response(scope, receive, send)
            return
        await self.target(scope, receive, send)


mcp_mount = _MCPMount()
app.mount("/", mcp_mount)
