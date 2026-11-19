"""
Tests for Node.js Backend Client abstraction.
"""
import pytest
import httpx
from app.integrations.node_client import NodeBackendClient
from app.core.exceptions import ExternalServiceError


@pytest.mark.asyncio
async def test_node_client_header_building():
    """Verify headers include internal service key and forwarded tenant context."""
    client = NodeBackendClient(
        base_url="http://node-test:5000",
        service_secret="secret_key_123",
        timeout=10.0,
    )
    headers = client._build_headers(
        seller_id="seller-123",
        store_id="store-456",
        user_role="admin",
        custom_headers={"X-Custom": "Val"},
    )
    assert headers["X-Internal-Service-Key"] == "secret_key_123"
    assert headers["X-Seller-ID"] == "seller-123"
    assert headers["X-Store-ID"] == "store-456"
    assert headers["X-User-Role"] == "admin"
    assert headers["X-Custom"] == "Val"


@pytest.mark.asyncio
async def test_node_client_success_response():
    """Verify successful JSON response parsing."""
    async def mock_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-Internal-Service-Key"] == "test_secret"
        assert request.headers["X-Seller-ID"] == "seller-1"
        return httpx.Response(200, json={"success": True, "data": {"products": [1, 2, 3]}})

    transport = httpx.MockTransport(mock_handler)
    mock_async_client = httpx.AsyncClient(transport=transport, base_url="http://mock-backend")

    client = NodeBackendClient(
        base_url="http://mock-backend",
        service_secret="test_secret",
        client=mock_async_client,
    )

    data = await client.get("/api/products", seller_id="seller-1")
    assert data["success"] is True
    assert len(data["data"]["products"]) == 3
    await client.close()


@pytest.mark.asyncio
async def test_node_client_error_response():
    """Verify HTTP >= 400 raises ExternalServiceError with backend message."""
    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"success": False, "message": "Product not found"})

    transport = httpx.MockTransport(mock_handler)
    mock_async_client = httpx.AsyncClient(transport=transport, base_url="http://mock-backend")

    client = NodeBackendClient(
        base_url="http://mock-backend",
        service_secret="test_secret",
        client=mock_async_client,
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.get("/api/products/missing-id")

    assert "Product not found" in str(exc_info.value.message)
    await client.close()


@pytest.mark.asyncio
async def test_node_client_timeout_handling():
    """Verify httpx.TimeoutException raises ExternalServiceError."""
    async def mock_timeout(request: httpx.Request):
        raise httpx.TimeoutException("Timed out")

    transport = httpx.MockTransport(mock_timeout)
    mock_async_client = httpx.AsyncClient(transport=transport, base_url="http://mock-backend")

    client = NodeBackendClient(
        base_url="http://mock-backend",
        service_secret="test_secret",
        timeout=2.0,
        client=mock_async_client,
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.get("/api/slow-endpoint")

    assert "timed out" in str(exc_info.value.message).lower()
    await client.close()
