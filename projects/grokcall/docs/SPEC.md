# GrokCall — System Specification

Version: 1.0 (Implementation-Ready)
Primary Goal: Replace voicemail with a live AI telephone assistant powered by a user's Grok Bot via MCP, using 46elks for telephony and ElevenLabs for realtime speech.

---

## 1. Architectural Model

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

## 2. Telephony Interface (46elks)

### 2.1 Incoming Call Webhook
- **URL**: `POST /46elks/incoming`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Fields**:
  - `callid`: unique 46elks call ID (e.g. `c45072...`)
  - `from`: caller E.164 number (e.g. `+46701234567`)
  - `to`: 46elks dialed number (e.g. `+46766861234`)
  - `direction`: `incoming`
- **Response**: JSON call action object:
  ```json
  {
    "play": "https://<host>/static/connecting.mp3",
    "next": {
      "connect": "+4676686REALTIME"
    }
  }
  ```
  *(If connecting directly without intermediate PSTN leg, voice_start can point straight to realtime action)*.

### 2.2 Hangup Callback
- **URL**: `POST /46elks/hangup`
- **Fields**: `callid`, `result`, `duration`, `from`, `to`
- Transitions call state to `ENDED` if not already closed.

### 2.3 Realtime Audio WebSocket
- **URL**: `wss://<host>/46elks/realtime` (optional query/path secret for verification)
- **Protocol**:
  1. 46elks sends `{"t": "hello", "callid": "...", "from": "...", "to": "..."}`.
  2. Gateway responds with:
     - `{"t": "listening", "format": "ulaw"}`
     - `{"t": "sending", "format": "ulaw"}`
  3. Gateway streams caller audio: `{"t": "audio", "data": "<base64>"}`.
  4. Gateway sends assistant speech: `{"t": "audio", "data": "<base64>"}`.
  5. Barge-in / Interruption:
     - Gateway sends `{"t": "interrupt"}` (clears 46elks buffer).
     - To resume playback later, gateway re-sends `{"t": "sending", "format": "ulaw"}`.
  6. Termination:
     - Gateway sends `{"t": "bye"}` and awaits `{"t": "bye"}` from 46elks before closing WebSocket.
     - Or 46elks sends `{"t": "bye", "reason": "...", "message": "..."}` on caller hangup.

---

## 3. Realtime Speech (ElevenLabs)

### 3.1 Speech-to-Text (Scribe Realtime)
- **URL**: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
- **Query / Config**:
  - `audio_format=ulaw_8000`
  - `commit_strategy=vad`
  - `vad_silence_threshold_secs=0.7`
  - language auto-detected by default (`include_language_detection=true`); `language_code`/`secondary_languages` optional hints
  - `include_language_detection=true`
- **Header**: `xi-api-key: <ELEVENLABS_API_KEY>`
- **Messages Sent**:
  - `{"message_type": "input_audio_chunk", "audio_base_64": "...", "commit": false, "sample_rate": 8000}`
- **Messages Received**:
  - `session_started`: confirm connection.
  - `partial_transcript`: used for early barge-in detection when caller speaks over assistant.
  - `committed_transcript` / `committed_transcript_with_timestamps`: new completed caller turn.

### 3.2 Text-to-Speech (Flash Multilingual)
- **Endpoint**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=ulaw_8000`
- **Body**:
  ```json
  {
    "text": "Hej! Patrik kunde inte svara just nu...",
    "model_id": "eleven_flash_v2_5",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75
    }
  }
  ```
- **Stream**: Directly yields raw G.711 μ-law bytes at 8000 Hz. Gateway chunks into 20ms–100ms frames (160–800 bytes) and sends as `{"t": "audio", "data": base64}`.

---

## 4. MCP Tools Specification

Exposed at `POST /mcp` (Streamable HTTP, Bearer auth):

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_active_calls` | (none) | Lists non-ended calls (`call_id`, `caller`, `status`, `duration_seconds`). |
| `get_call` | `call_id: str` | Full call state: caller, status, transcript turns, messages, timestamps. |
| `wait_for_next_utterance` | `call_id: str`, `after_turn: int = 0`, `timeout_seconds: int = 20` | Long-poll up to 25s for next committed caller utterance. Returns `{"event": "utterance", "turn": int, "text": str, "language": str}` or `{"event": "timeout", "latest_turn": int}` or `{"event": "call_ended"}`. |
| `speak` | `call_id: str`, `text: str`, `language: str = None` | Synthesizes speech via ElevenLabs TTS and streams to caller. |
| `interrupt_speech` | `call_id: str` | Clears audio buffers and cancels active playback. |
| `take_message` | `call_id: str`, `caller_name: str`, `message: str`, `callback_requested: bool = True`, `urgency: str = "normal"` | Records structured caller message. |
| `hang_up` | `call_id: str`, `final_words: str = None` | Optionally speaks final sentence, then sends bye to telephony. |

---

## 5. Fallback & Latency Protections

1. **Masking Latency**: `connecting.mp3` plays immediately while Grok wakes via Slack.
2. **Hold Timeout**: If Grok does not invoke `speak` or `wait_for_next_utterance` within `grok_wake_timeout_seconds` (default 6.0s), the gateway plays an interim message: `"Ett ögonblick så kopplar jag dig..."`.
3. **Hard Fallback**: If Grok fails to respond within `fallback_timeout_seconds` (default 12.0s), a deterministic fallback assistant takes over: announces AI status, asks for name, message and callback number, records audio/transcript, and hangs up gracefully.

---

## 6. Database Schema (SQLite)

- `calls`: id, provider_call_id, caller_number, called_number, started_at, ended_at, status, language, summary, metrics_json.
- `call_turns`: id, call_id, turn_number, speaker (caller/assistant), text, language, created_at.
- `call_messages`: id, call_id, caller_name, message, callback_requested, urgency, created_at.
