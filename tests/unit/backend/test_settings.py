import pytest

from backend.core.config import Settings


@pytest.fixture(autouse=True)
def reset_core_env(monkeypatch):
    """Ensure core settings are reset between tests."""
    for key in ("ENVIRONMENT", "DATABASE_URL", "REDIS_URL", "SDNEXT_BASE_URL"):
        monkeypatch.delenv(key, raising=False)


def test_from_env_defaults_in_development(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")

    settings = Settings.from_env()

    assert settings.ENVIRONMENT == "development"
    assert settings.DATABASE_URL is None
    assert settings.REDIS_URL is None


def test_production_requires_core_settings(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")

    with pytest.raises(RuntimeError) as exc:
        Settings.from_env()

    message = str(exc.value)
    assert "DATABASE_URL" in message
    assert "REDIS_URL" in message
    assert "SDNEXT_BASE_URL" in message


def test_production_accepts_populated_settings(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", " Production ")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgres:5432/lora")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("SDNEXT_BASE_URL", "http://sdnext:7860")

    settings = Settings.from_env()

    assert settings.ENVIRONMENT == "production"
    assert settings.DATABASE_URL == "postgresql://user:pass@postgres:5432/lora"
    assert settings.REDIS_URL == "redis://redis:6379/0"
    assert settings.SDNEXT_BASE_URL == "http://sdnext:7860"


def test_from_env_raises_runtime_error(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///tmp.db")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("SDNEXT_BASE_URL", " ")

    with pytest.raises(RuntimeError) as exc:
        Settings.from_env()

    assert "SDNEXT_BASE_URL" in str(exc.value)
