"""
Configuration validation and security tests.
"""
import pytest
from pydantic import ValidationError
from app.core.config import Settings


def test_default_development_config():
    """Verify standard development defaults behave properly."""
    settings = Settings(
        APP_ENV="development",
        AI_SERVICE_SECRET="dev_internal_ai_service_secret_key_change_in_production_32b"
    )
    assert settings.PORT == 8000
    assert settings.APP_NAME == "BhartiyeCrafts-AI-Service"
    assert settings.is_production is False
    assert settings.is_gemini_configured is False
    assert settings.is_ollama_configured is True


def test_invalid_log_level_rejected():
    """Invalid log level string should raise validation error."""
    with pytest.raises(ValidationError):
        Settings(LOG_LEVEL="SUPER_VERBOSE")


def test_production_rejects_default_secret():
    """In production, the insecure development default secret must be rejected."""
    with pytest.raises(ValidationError):
        Settings(
            APP_ENV="production",
            AI_SERVICE_SECRET="dev_internal_ai_service_secret_key_change_in_production_32b"
        )


def test_production_rejects_short_secret():
    """In production, secrets shorter than 32 characters must be rejected."""
    with pytest.raises(ValidationError):
        Settings(
            APP_ENV="production",
            AI_SERVICE_SECRET="short_secret_under_32_chars"
        )


def test_production_accepts_valid_secret():
    """In production, secure 32+ character secrets must be accepted."""
    settings = Settings(
        APP_ENV="production",
        AI_SERVICE_SECRET="production_secure_secret_key_32_characters_long_min!"
    )
    assert settings.is_production is True
    assert len(settings.AI_SERVICE_SECRET) >= 32


def test_secret_not_exposed_in_repr():
    """Ensure sensitive secrets are never printed in string representations."""
    secret = "my_super_secret_key_123456789012345"
    settings = Settings(AI_SERVICE_SECRET=secret)
    repr_str = repr(settings)
    assert secret not in repr_str
    assert "Settings" in repr_str
