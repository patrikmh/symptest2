import logging

import pytest
from pydantic import ValidationError

from grokcall.core.config import Settings


def test_missing_base_url_warns_and_falls_back_outside_production(monkeypatch, caplog):
    monkeypatch.delenv("BASE_URL", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    with caplog.at_level(logging.WARNING, logger="grokcall.config"):
        cfg = Settings(_env_file=None)
    assert cfg.base_url == "http://localhost:8000"
    assert cfg._base_url_fallback is True
    assert any("BASE_URL is not set" in record.message for record in caplog.records)


def test_missing_base_url_fails_startup_in_production(monkeypatch):
    monkeypatch.delenv("BASE_URL", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "BASE_URL must be set when APP_ENV=production" in str(exc.value)


def test_blank_base_url_fails_startup_in_production(monkeypatch):
    monkeypatch.setenv("BASE_URL", "   ")
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "BASE_URL" in str(exc.value)


def test_explicit_base_url_is_kept_in_production(monkeypatch, caplog):
    monkeypatch.setenv("BASE_URL", "https://phone.example.com")
    monkeypatch.setenv("APP_ENV", "production")
    with caplog.at_level(logging.WARNING, logger="grokcall.config"):
        cfg = Settings(_env_file=None)
    assert cfg.base_url == "https://phone.example.com"
    assert cfg._base_url_fallback is False
    assert not any("BASE_URL is not set" in record.message for record in caplog.records)
