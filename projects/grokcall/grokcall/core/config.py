from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server environment
    app_env: str = "development"
    debug: bool = False
    port: int = 8000
    host: str = "0.0.0.0"
    base_url: str = "http://localhost:8000"

    # Security
    mcp_bearer_token: str = "dev-secret-token"
    realtime_auth_token: Optional[str] = None

    # Telephony (46elks)
    fortysixelks_api_username: Optional[str] = None
    fortysixelks_api_password: Optional[str] = None
    fortysixelks_realtime_number: Optional[str] = "+46766860000"
    fortysixelks_connecting_audio_url: Optional[str] = None

    # Realtime Speech (ElevenLabs)
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel (multilingual) or custom Swedish/English voice
    elevenlabs_model_id: str = "eleven_flash_v2_5"
    elevenlabs_stt_url: str = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
    elevenlabs_tts_url: str = "https://api.elevenlabs.io/v1/text-to-speech"

    # Slack Wake Channel
    slack_webhook_url: Optional[str] = None
    slack_channel: Optional[str] = "#phone-bot-wake"

    # Assistant Persona & Language
    assistant_owner_name: str = "Patrik"
    default_language: str = "sv"

    # Latency & Fallback Timeouts (seconds)
    grok_wake_timeout_seconds: float = 6.0
    fallback_timeout_seconds: float = 12.0
    utterance_poll_max_seconds: float = 25.0

    # Persistence
    sqlite_db_path: str = "grokcall.db"


settings = Settings()
