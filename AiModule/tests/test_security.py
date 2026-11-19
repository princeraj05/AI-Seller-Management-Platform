"""
Security and internal service authentication tests.
"""
from fastapi.testclient import TestClient
from app.core.security import verify_internal_secret


def test_missing_internal_secret_rejected(client: TestClient):
    """Protected internal endpoints must reject requests with no secret."""
    response = client.get("/api/v1/verify-auth")
    assert response.status_code == 401
    data = response.json()
    assert data["success"] is False
    assert data["code"] == "AUTHENTICATION_FAILED"
    # Verify no secret is leaked in error response
    assert "test_internal_secret" not in str(data)


def test_invalid_internal_secret_rejected(client: TestClient):
    """Requests with wrong secret must be rejected with 401."""
    response = client.get(
        "/api/v1/verify-auth",
        headers={"X-Internal-Service-Key": "wrong_invalid_secret_key"}
    )
    assert response.status_code == 401
    data = response.json()
    assert data["success"] is False
    assert data["code"] == "AUTHENTICATION_FAILED"


def test_valid_internal_secret_accepted(client: TestClient):
    """Requests with valid secret must succeed."""
    response = client.get(
        "/api/v1/verify-auth",
        headers={"X-Internal-Service-Key": "test_internal_secret_key_1234567890_32chars"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["is_internal_service"] is True


def test_seller_context_extraction(client: TestClient):
    """Context headers (X-Seller-ID, X-Store-ID, X-User-Role) must be correctly parsed."""
    headers = {
        "X-Internal-Service-Key": "test_internal_secret_key_1234567890_32chars",
        "X-Seller-ID": "seller_test_9876",
        "X-Store-ID": "store_test_5432",
        "X-User-Role": "seller",
    }
    response = client.get("/api/v1/verify-seller-context", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["seller_id"] == "seller_test_9876"
    assert data["data"]["store_id"] == "store_test_5432"
    assert data["data"]["user_role"] == "seller"


def test_missing_seller_context_rejected(client: TestClient):
    """Seller-scoped endpoints must reject requests without X-Seller-ID even if secret is valid."""
    headers = {
        "X-Internal-Service-Key": "test_internal_secret_key_1234567890_32chars",
    }
    response = client.get("/api/v1/verify-seller-context", headers=headers)
    assert response.status_code == 403
    data = response.json()
    assert data["success"] is False
    assert data["code"] == "FORBIDDEN"


def test_constant_time_comparison():
    """Verify verify_internal_secret returns False for empty or mismatched strings."""
    assert verify_internal_secret(None) is False
    assert verify_internal_secret("") is False
    assert verify_internal_secret("bad_key") is False
