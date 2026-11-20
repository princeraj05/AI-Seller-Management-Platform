"""
Unit tests for Ollama Vision Client integration.
"""
import pytest
import httpx
from app.core.exceptions import ExternalServiceError
from app.integrations.ollama_client import OllamaVisionClient


@pytest.mark.asyncio
async def test_ollama_successful_analysis():
    """Verify Ollama client parses structured JSON from model output."""
    mock_response_json = {
        "message": {
            "content": """```json
{
  "product_type": "Handcrafted Wooden Box",
  "visual_description": "Carved floral jewelry box with brass latch",
  "multiple_products_detected": false,
  "suggested_primary_category": "Home Decor & Living",
  "suggested_subcategory": "Storage & Boxes",
  "primary_color": "Brown",
  "secondary_colors": ["Gold"],
  "apparent_material": "Carved wood finish",
  "pattern": "Floral carving",
  "shape": "Rectangular",
  "craft_technique": "Hand-carved",
  "decorative_elements": ["Brass latch"],
  "uncertainties": ["Exact wood type"]
}
```"""
        }
    }

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/chat"
        return httpx.Response(200, json=mock_response_json)

    transport = httpx.MockTransport(mock_handler)
    mock_http_client = httpx.AsyncClient(transport=transport, base_url="http://mock-ollama")

    client = OllamaVisionClient(
        base_url="http://mock-ollama",
        model_name="qwen2.5-vl:7b",
        client=mock_http_client,
    )

    data = await client.analyze_product_image("fake_base64_string")
    assert data["product_type"] == "Handcrafted Wooden Box"
    assert data["primary_color"] == "Brown"
    assert data["apparent_material"] == "Carved wood finish"
    assert data["multiple_products_detected"] is False
    await client.close()


@pytest.mark.asyncio
async def test_ollama_model_not_found():
    """Verify 404 response raises ExternalServiceError with model pull suggestion."""
    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="model not found")

    transport = httpx.MockTransport(mock_handler)
    mock_http_client = httpx.AsyncClient(transport=transport, base_url="http://mock-ollama")

    client = OllamaVisionClient(
        base_url="http://mock-ollama",
        model_name="nonexistent-model",
        client=mock_http_client,
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image("fake_base64")

    assert "was not found on ollama" in str(exc_info.value.message).lower()
    await client.close()


@pytest.mark.asyncio
async def test_ollama_timeout():
    """Verify inference timeout raises ExternalServiceError."""
    async def mock_timeout(request: httpx.Request):
        raise httpx.TimeoutException("Timed out")

    transport = httpx.MockTransport(mock_timeout)
    mock_http_client = httpx.AsyncClient(transport=transport, base_url="http://mock-ollama")

    client = OllamaVisionClient(
        base_url="http://mock-ollama",
        model_name="qwen2.5-vl:7b",
        timeout=1.0,
        client=mock_http_client,
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image("fake_base64")

    assert "timed out" in str(exc_info.value.message).lower()
    await client.close()


@pytest.mark.asyncio
async def test_ollama_check_availability_reachable():
    """Verify check_availability reports models when Ollama is running."""
    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "qwen2.5-vl:7b"}, {"name": "llama3:latest"}]})

    transport = httpx.MockTransport(mock_handler)
    mock_http_client = httpx.AsyncClient(transport=transport, base_url="http://mock-ollama")

    client = OllamaVisionClient(
        base_url="http://mock-ollama",
        model_name="qwen2.5-vl:7b",
        client=mock_http_client,
    )

    status = await client.check_availability()
    assert status["reachable"] is True
    assert status["model_found"] is True
    assert "qwen2.5-vl:7b" in status["available_models"]
    await client.close()
