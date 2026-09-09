# GrokCall — Implementation Plan

This plan organizes the implementation into 8 phases matching the system spec.

---

## Phase 1: Core Domain Models & Call State Machine
- `grokcall/core/models.py`:
  - `CallStatus`: `RINGING`, `WAITING`, `WAKING_AGENT`, `CONNECTING`, `LIVE`, `ENDING`, `ENDED`, `FAILED`.
  - `Speaker`: `CALLER`, `ASSISTANT`, `SYSTEM`.
  - `CallTurn`: `turn_number`, `speaker`, `text`, `language`, `timestamp`.
  - `CallMessage`: `caller_name`, `message`, `callback_requested`, `urgency`, `timestamp`.
  - `CallTimings`: all observability timestamps (`incoming_webhook_at`, `slack_event_sent_at`, `grok_first_mcp_call_at`, etc.).
  - `CallSession`: in-memory mutable session containing turns, messages, audio queue, event dispatchers.
- `grokcall/core/config.py`: Pydantic settings loading from env (`FORTYSIXELKS_*`, `ELEVENLABS_*`, `SLACK_WEBHOOK_URL`, `MCP_BEARER_TOKEN`, `REALTIME_PATH_TOKEN`, timeouts, etc.).
- `grokcall/core/registry.py`:
  - `CallRegistry`: thread/async-safe lookup by `call_id` and `provider_call_id`.
  - Long-polling mechanism (`wait_for_turn`, `wait_for_live`).
- `grokcall/core/ports.py`:
  - Protocols / Abstract Base Classes for:
    - `TelephonyPort`: outbound actions, sending bye, sending raw audio chunks, sending interrupt.
    - `SpeechToTextPort`: streaming audio to STT, callback on partial/committed transcript.
    - `TextToSpeechPort`: synthesizing text to streaming G.711 μ-law 8000 Hz audio.
    - `WakeNotifierPort`: sending wake event to Slack (or stub).

---

## Phase 2: Adapters
- `grokcall/adapters/fortysixelks/telephony.py`:
  - Webhook parser for incoming calls and hangup notifications.
  - Action builder (`play`, `connect`, `hangup`).
  - WebSocket protocol handler for Realtime Voice (`hello`, `listening`, `sending`, `audio`, `interrupt`, `bye`).
- `grokcall/adapters/elevenlabs/stt.py`:
  - WebSocket client for ElevenLabs Scribe realtime STT (`wss://api.elevenlabs.io/v1/speech-to-text/realtime`).
  - Sends `input_audio_chunk` with base64 μ-law audio.
  - Emits partial and committed transcripts with detected language.
- `grokcall/adapters/elevenlabs/tts.py`:
  - HTTP streaming client for ElevenLabs Flash TTS (`POST /v1/text-to-speech/{voice_id}/stream?output_format=ulaw_8000`).
  - Streaming audio chunks in real time.
- `grokcall/adapters/slack_wake.py`:
  - Sends `PHONE_CALL_STARTED` message to private Slack webhook URL.
- `grokcall/adapters/fakes.py`:
  - In-memory / mock implementations of all ports for deterministic fast unit and integration tests.

---

## Phase 3: Call Pipeline & Audio Coordinator
- `grokcall/core/pipeline.py`:
  - Coordinates bidirectional audio between 46elks WS, ElevenLabs STT, and ElevenLabs TTS.
  - Handles barge-in / interruption: when caller speech is detected while assistant is speaking, cancels TTS stream, sends `{"t": "interrupt"}` to 46elks, clears audio queues.
  - Manages hold / connecting audio fallback: if Grok does not take over in time, plays polite wait audio or activates deterministic message-taking fallback.

---

## Phase 4: Persistence (SQLite) & Observability
- `grokcall/persistence/database.py`:
  - Async SQLite database (`aiosqlite` or standard `sqlite3` in threadpool).
  - Creates tables: `calls`, `call_turns`, `call_messages`.
  - Saves full call state, transcript, and computed latency metrics upon call completion.
- `grokcall/scripts/latency_report.py`:
  - CLI script to compute median, p90, and p95 latency across recorded calls (Test A wake latency & conversational turn latency).

---

## Phase 5: MCP Server & Tools
- `grokcall/api/mcp_server.py`:
  - Exposes Streamable HTTP endpoint for Grok Bot.
  - Implements the 7 specified tools:
    1. `get_active_calls`
    2. `get_call`
    3. `wait_for_next_utterance` (with 25s max timeout long-polling)
    4. `speak`
    5. `interrupt_speech`
    6. `take_message`
    7. `hang_up`
  - Bearer token authentication middleware.

---

## Phase 6: FastAPI Application & Endpoints
- `grokcall/api/app.py`:
  - Mounts 46elks webhooks: `POST /46elks/incoming`, `POST /46elks/hangup`.
  - Mounts 46elks realtime WebSocket: `WebSocket /46elks/realtime`.
  - Mounts MCP Streamable HTTP app at `/mcp`.
  - Health check endpoint: `GET /health`.
  - Static file serving for `connecting.mp3` and fallback audio prompts.

---

## Phase 7: Automated Tests
- `tests/test_models_and_registry.py`: unit tests for call state machine and long-polling.
- `tests/test_adapters.py`: unit tests for 46elks webhook payloads, ElevenLabs STT/TTS formatting, Slack wake format.
- `tests/test_pipeline_and_barge_in.py`: simulates caller speech interrupting assistant playback.
- `tests/test_mcp_tools.py`: direct tool invocations testing long-poll, speak, take_message, hang_up.
- `tests/test_end_to_end_call.py`: full end-to-end integration test simulating 46elks incoming call, Slack wake, WebSocket audio connection, Grok conversational loop via MCP, and hangup.

---

## Phase 8: Deployment & Grok Routine Assets
- `Dockerfile`: minimal multi-stage Python 3.12 container.
- `docker-compose.yml`: services for `grokcall` gateway and `cloudflared` tunnel.
- `.env.example`: template for all configuration and secrets.
- `prompts/grok_bot_routine.md`: prompt and instructions for the Grok Bot routine triggering on `PHONE_CALL_STARTED`.
- `README.md`: complete installation, setup, test, and operational instructions.
- Update root `README.md` and monorepo CI.
