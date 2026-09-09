# GrokCall — AI Phone Assistant Gateway

GrokCall replaces ordinary mobile voicemail with a live AI assistant powered by the user's **xAI Grok Bot** via MCP, using **46elks** for telephony and **ElevenLabs** for realtime speech (STT + TTS).

---

## Architecture

```
Caller (PSTN)
      │
      ▼
User's Mobile (Comviq conditional forwarding on no-answer/busy)
      │
      ▼
46elks Voice Number (+46...)
      │ HTTP POST /46elks/incoming
      ▼
Phone Gateway (FastAPI + CallRegistry)
      │
      ├─► Slack Webhook: PHONE_CALL_STARTED (wake signal only)
      │        │
      │        ▼
      │   Grok Bot wakes and connects via MCP
      │        │
      ├─► 46elks action response: play connecting.mp3 -> connect to realtime number
      │
      ▼
46elks Realtime WebSocket (wss://.../46elks/realtime)
      │ G.711 μ-law 8000 Hz bidirectional audio
      ▼
Phone Gateway CallPipeline
      ├─► ElevenLabs STT WebSocket (Scribe realtime, μ-law 8000 Hz, VAD commit)
      │        │ committed transcript + language (sv / en)
      │        ▼
      │   CallTurn queued in CallSession
      │        ▲
      │        │ wait_for_next_utterance()
      │   Grok Bot (MCP Streamable HTTP)
      │        │
      │        │ speak(text, language)
      │        ▼
      └─◄ ElevenLabs TTS API (Flash multilingual streaming -> μ-law 8000 Hz)
               │ audio packets base64
               ▼
          46elks Realtime WebSocket -> Caller
```

---

## Key Features

- **Grok Bot owns reasoning**: The telephone layer has no independent personality. Grok decides what to say, whether information can be disclosed, and when to end the call.
- **Natural Language Switching**: Converses in Swedish by default, switches seamlessly to English if the caller speaks English, and follows callers back to Swedish.
- **Barge-in / Interruption**: When caller speech is detected while the assistant is speaking, output playback is immediately cancelled, 46elks audio buffer is flushed with `{"t": "interrupt"}`, and the new caller turn is processed.
- **Zero Caller Silence**: While Grok wakes via Slack, the caller hears a connecting clip (or a TTS connecting sentence if no clip is configured). If Grok has not touched the call via MCP after 6 s a hold line is spoken; after 12 s a scripted fallback assistant identifies itself as automated, takes a message and hangs up. Anything Grok `speak`s before the audio leg is up is queued and played on connect.
- **Streamable HTTP MCP Server**: Exposes 7 tools (`get_active_calls`, `get_call`, `wait_for_next_utterance`, `speak`, `interrupt_speech`, `take_message`, `hang_up`) with Bearer token authentication. Stateless JSON transport; long-polls are released the moment the call ends.
- **Observability**: Per-call and per-turn timing markers (wake, inference, TTS start, total turn) are persisted to SQLite when a call ends. `scripts/latency_report.py` prints p50/p90/p95.
- **Security**: Bearer token on `/mcp`, optional secret path segment for the 46elks realtime WebSocket, nothing but the tunnel needs to reach the gateway.

---

## Directory Structure

```
projects/grokcall/
├── docs/
│   ├── SPEC.md               # Technical specification v1.0
│   └── PLAN.md               # Implementation milestones and phases
├── grokcall/
│   ├── core/
│   │   ├── config.py         # Pydantic settings (.env)
│   │   ├── models.py         # CallStatus, Speaker, CallTurn, CallTimings
│   │   ├── language.py       # Heuristic language detector (sv/en)
│   │   ├── registry.py       # Async CallSession & CallRegistry with long-polling
│   │   ├── ports.py          # Protocols for Telephony, STT, TTS, Wake
│   │   └── pipeline.py       # Bidirectional audio coordinator & barge-in
│   ├── adapters/
│   │   ├── fortysixelks/     # 46elks webhook & Realtime Voice WebSocket
│   │   ├── elevenlabs/       # Scribe STT WebSocket & Flash TTS streaming
│   │   ├── slack_wake.py     # Slack wake signal notifier
│   │   └── fakes.py          # Deterministic in-memory fakes for tests
│   ├── api/
│   │   ├── mcp_server.py     # MCP Streamable HTTP server & tools
│   │   └── app.py            # FastAPI webhooks, WS route, & MCP mount
│   └── persistence/
│       └── database.py       # SQLite persistence for calls, turns, & metrics
├── assets/                   # Static files served under /static (connecting.mp3)
├── prompts/
│   └── grok_bot_routine.md   # Prompt template for Grok Bot routine
├── scripts/
│   └── latency_report.py     # CLI tool for p50/p90/p95 latency metrics
├── tests/                    # Comprehensive unit and integration test suite
├── Dockerfile                # Production Docker container
├── docker-compose.yml        # Gateway + Cloudflare Tunnel compose setup
├── requirements.txt          # Runtime dependencies
├── requirements-dev.txt      # + test dependencies
└── .env.example              # Configuration template (names match core/config.py)
```

---

## Quickstart

### 1. Install & Configure

```bash
cd projects/grokcall
pip install -r requirements-dev.txt
cp .env.example .env
```

Edit `.env`: 46elks credentials and the WebSocket-enabled number (`FORTYSIXELKS_REALTIME_NUMBER`), ElevenLabs API key, Slack webhook URL, and fresh random values for `MCP_BEARER_TOKEN` and `REALTIME_PATH_TOKEN`. Without an ElevenLabs key the gateway starts with fake speech providers for local development.

Point 46elks at the gateway:

- Voice number `voice_start`: `POST https://<host>/46elks/incoming`
- Voice number `whenhangup`: `POST https://<host>/46elks/hangup`
- Realtime number WebSocket: `wss://<host>/46elks/realtime/<REALTIME_PATH_TOKEN>`

### 2. Run the Gateway Locally

```bash
cd projects/grokcall
uvicorn grokcall.api.app:app --host 0.0.0.0 --port 8000 --reload
```

Smoke-test the MCP endpoint with any MCP client using `http://localhost:8000/mcp` and `Authorization: Bearer <MCP_BEARER_TOKEN>`; `tests/test_end_to_end_call.py` does exactly this against the real server.

### 3. Run with Docker Compose & Cloudflare Tunnel

```bash
docker compose up -d
```

### 4. Running the Tests

```bash
# from the repository root
pytest projects/grokcall
```

The suite includes a whole-system test that boots the ASGI server, connects a fake 46elks peer over the real WebSocket protocol and drives the conversation through the real MCP client.

### 5. Latency Reporting

Run Test A / Test B metrics analysis:

```bash
python projects/grokcall/scripts/latency_report.py /path/to/grokcall.db
```
