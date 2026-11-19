"""
Pytest configuration and shared fixtures for Bhartiye Crafts AI Service test suite.
"""
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_application


@pytest.fixture
def test_settings() -> Settings:
    """Return test-specific settings."""
    return Settings(
        APP_NAME="BhartiyeCrafts-AI-Service-Test",
        APP_ENV="test",
        DEBUG=True,
        AI_SERVICE_SECRET="test_internal_secret_key_1234567890_32chars",
        NODE_BACKEND_URL="http://testbackend:5000",
        NODE_BACKEND_TIMEOUT=5.0,
    )


@pytest.fixture
def client(test_settings: Settings) -> TestClient:
    """FastAPI TestClient fixture with overridden settings."""
    app = create_application()
    app.dependency_overrides[get_settings] = lambda: test_settings
    with TestClient(app) as test_client:
        yield test_client
