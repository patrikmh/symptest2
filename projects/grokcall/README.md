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
- **Zero Caller Silence**: While Grok wakes via Slack, 46elks plays a short connecting clip. If Grok takes longer than 6s, hold audio is repeated. If Grok does not awaken within 12s, an automated fallback assistant collects the caller's message.
- **Streamable HTTP MCP Server**: Exposes 7 tools (`get_active_calls`, `get_call`, `wait_for_next_utterance`, `speak`, `interrupt_speech`, `take_message`, `hang_up`) with Bearer token authentication.
- **Observability**: Automatically records wake latency, inference latency, TTS latency, and total conversational turn latency in SQLite. Includes `scripts/latency_report.py` for p50/p90/p95 calculations.

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
├── prompts/
│   └── grok_bot_routine.md   # Prompt template for Grok Bot routine
├── scripts/
│   └── latency_report.py     # CLI tool for p50/p90/p95 latency metrics
├── tests/                    # Comprehensive unit and integration test suite
├── Dockerfile                # Production Docker container
├── docker-compose.yml        # Gateway + Cloudflare Tunnel compose setup
├── requirements.txt          # Python dependencies
└── .env.example              # Configuration template
```

---

## Quickstart

### 1. Install & Configure

```bash
# In projects/grokcall or root virtual environment
pip install -r projects/grokcall/requirements.txt
cp projects/grokcall/.env.example projects/grokcall/.env
```

Edit `.env` with your 46elks credentials, ElevenLabs API key, Slack webhook URL, and a secure `MCP_BEARER_TOKEN`.

### 2. Run the Gateway Locally

```bash
uvicorn grokcall.api.app:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Run with Docker Compose & Cloudflare Tunnel

```bash
docker compose up -d
```

### 4. Running the Tests

```bash
# Run GrokCall tests
pytest projects/grokcall
```

### 5. Latency Reporting

Run Test A / Test B metrics analysis:

```bash
python projects/grokcall/scripts/latency_report.py grokcall.db
```
