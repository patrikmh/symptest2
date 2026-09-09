import sys
from pathlib import Path

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from grokcall.core.config import settings  # noqa: E402
from grokcall.core.registry import registry  # noqa: E402


@pytest.fixture(autouse=True)
def clean_registry():
    registry._sessions.clear()
    registry._provider_map.clear()
    yield


@pytest.fixture(autouse=True)
def test_settings(monkeypatch, tmp_path):
    """Deterministic settings: fake speech providers, a realtime number so the
    incoming webhook bridges calls, and a throwaway SQLite file."""
    monkeypatch.setattr(settings, "elevenlabs_api_key", None)
    monkeypatch.setattr(settings, "slack_webhook_url", None)
    monkeypatch.setattr(settings, "fortysixelks_realtime_number", "+46766860099")
    monkeypatch.setattr(settings, "connecting_audio_url", None)
    monkeypatch.setattr(settings, "realtime_path_token", None)
    monkeypatch.setattr(settings, "mcp_bearer_token", "test-token")
    monkeypatch.setattr(settings, "sqlite_db_path", str(tmp_path / "grokcall-test.db"))
    yield settings
