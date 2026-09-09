from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables and an optional .env file.

    Field names map 1:1 to upper-cased environment variables, e.g.
    ``fortysixelks_realtime_number`` is read from ``FORTYSIXELKS_REALTIME_NUMBER``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    app_env: str = "development"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    # Public origin (behind the tunnel). Used to build URLs handed to 46elks.
    base_url: str = "http://localhost:8000"

    # Security
    mcp_bearer_token: str = "dev-secret-token"
    # When set, the realtime WebSocket is only served at /46elks/realtime/<token>.
    realtime_path_token: Optional[str] = None

    # 46elks
    fortysixelks_api_username: Optional[str] = None
    fortysixelks_api_password: Optional[str] = None
    # The WebSocket-enabled 46elks number the voice number connects the call to.
    fortysixelks_realtime_number: Optional[str] = None
    # Public URL of the short "connecting you" clip played before the realtime leg.
    # When unset, the gateway speaks the connecting sentence via TTS as soon as the
    # realtime leg is up instead.
    connecting_audio_url: Optional[str] = None

    # ElevenLabs
    elevenlabs_api_key: Optional[str] = None
    # Voice that speaks. The default is an English voice; for Swedish callers pick
    # a native Swedish voice in the ElevenLabs dashboard (Voices -> filter Swedish
    # -> preview) and put its ID here. This is the single biggest naturalness win.
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    # eleven_flash_v2_5: realtime (~75ms). eleven_multilingual_v2: more lifelike
    # Swedish prosody but ~1-2s slower per sentence. Try it with one .env change
    # if the Flash voice still feels stiff.
    elevenlabs_tts_model_id: str = "eleven_flash_v2_5"
    # Voice shaping. Lower stability = more expressive, higher = flatter.
    # style > 0 and use_speaker_boost add a little latency; speed < 1 calms
    # the delivery down slightly.
    elevenlabs_tts_stability: float = 0.4
    elevenlabs_tts_similarity_boost: float = 0.85
    elevenlabs_tts_style: float = 0.2
    elevenlabs_tts_use_speaker_boost: bool = True
    elevenlabs_tts_speed: float = 0.95
    elevenlabs_stt_model_id: str = "scribe_v2_realtime"
    elevenlabs_stt_url: str = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
    elevenlabs_tts_url: str = "https://api.elevenlabs.io/v1/text-to-speech"
    # Leave unset for automatic language detection (the spec default). Set e.g. "sv"
    # to pin a primary language; secondary languages are then passed as hints.
    elevenlabs_stt_language: Optional[str] = None
    elevenlabs_stt_secondary_languages: str = "en"
    elevenlabs_stt_vad_silence_secs: float = 0.7

    # Slack wake signal
    slack_webhook_url: Optional[str] = None

    # Persona
    assistant_owner_name: str = "Patrik"
    default_language: str = "sv"

    # Timeouts (seconds)
    # Grok has not shown up via MCP after this long: speak a short hold line.
    grok_hold_timeout_seconds: float = 6.0
    # Grok still absent after this long: the scripted fallback assistant takes over.
    grok_fallback_timeout_seconds: float = 12.0
    # Hard cap for a single wait_for_next_utterance MCP request.
    utterance_poll_max_seconds: float = 25.0
    # Calls that never reach LIVE are failed after this long.
    pending_call_expiry_seconds: float = 120.0
    # Finished calls are dropped from memory after this long (they are in SQLite).
    ended_call_retention_seconds: float = 3600.0

    # Persistence
    sqlite_db_path: str = "grokcall.db"


settings = Settings()
