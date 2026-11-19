"""
Application health and readiness probe tests.
"""
from fastapi.testclient import TestClient


def test_liveness_endpoint(client: TestClient):
    """Test GET /health returns 200 OK with valid liveness payload."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "BhartiyeCrafts-AI-Service-Test"
    assert "uptime_seconds" in data
    assert "timestamp" in data
    assert "version" in data
    # Ensure request ID header was attached
    assert "X-Request-ID" in response.headers
    assert "X-Response-Time-MS" in response.headers


def test_readiness_endpoint(client: TestClient):
    """Test GET /health/ready returns 200 OK with valid configuration status."""
    response = client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert "checks" in data
    assert data["checks"]["configuration"] == "valid"
    assert data["checks"]["node_backend_target"] == "configured"
    assert data["checks"]["internal_secret"] == "configured"
