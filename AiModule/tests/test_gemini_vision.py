"""
Unit tests for Google Gemini Multimodal Vision Client integration.
"""
import base64
import json
from unittest.mock import AsyncMock, MagicMock
import pytest

from app.core.exceptions import ExternalServiceError
from app.integrations.gemini_vision_client import GeminiVisionClient


@pytest.fixture
def mock_gemini_response_payload():
    return {
        "product_type": "Handcrafted Blue Pottery Floral Vase",
        "visual_description": "Traditional glazed ceramic flower vase with cobalt blue and turquoise floral patterns",
        "multiple_products_detected": False,
        "suggested_primary_category": "Home Decor & Living",
        "suggested_subcategory": "Vases & Planters",
        "primary_color": "Cobalt Blue",
        "secondary_colors": ["Turquoise", "White", "Yellow"],
        "apparent_material": "Glazed ceramic / blue pottery",
        "pattern": "Traditional Jaipur floral motifs",
        "shape": "Cylindrical with flared neck",
        "craft_technique": "Hand-painted blue pottery glazing",
        "decorative_elements": ["Flared rim", "Floral neck bands"],
        "uncertainties": ["Exact clay composition cannot be verified visually"],
    }


@pytest.mark.asyncio
async def test_gemini_client_unconfigured_error():
    """Verify calling analyze_product_image without an API key raises ExternalServiceError."""
    client = GeminiVisionClient(api_key="")
    assert client.is_configured() is False

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image(b"fake_image_bytes")

    assert "api key is not configured" in str(exc_info.value.message).lower()


@pytest.mark.asyncio
async def test_gemini_check_availability_unconfigured():
    """Verify check_availability reports configured=False when key is empty."""
    client = GeminiVisionClient(api_key="")
    status = await client.check_availability()
    assert status["configured"] is False
    assert status["provider"] == "gemini"
    assert status["reachable"] is False
    assert "error" in status


@pytest.mark.asyncio
async def test_gemini_check_availability_configured():
    """Verify check_availability reports configured=True when key is set."""
    client = GeminiVisionClient(api_key="test_mock_api_key_xyz")
    status = await client.check_availability()
    assert status["configured"] is True
    assert status["provider"] == "gemini"
    assert status["reachable"] is True
    assert status["sdk"] == "google-genai"


@pytest.mark.asyncio
async def test_gemini_successful_inference_bytes(mock_gemini_response_payload):
    """Verify Gemini client correctly passes bytes, receives and parses structured output."""
    client = GeminiVisionClient(api_key="mock_valid_key")

    mock_resp = MagicMock()
    mock_resp.text = json.dumps(mock_gemini_response_payload)

    mock_genai_client = MagicMock()
    mock_genai_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)
    client._client = mock_genai_client

    result = await client.analyze_product_image(b"fake_jpeg_bytes", mime_type="image/jpeg")

    assert result["product_type"] == "Handcrafted Blue Pottery Floral Vase"
    assert result["primary_color"] == "Cobalt Blue"
    assert result["apparent_material"] == "Glazed ceramic / blue pottery"
    assert result["multiple_products_detected"] is False
    assert "_duration_ms" in result
    mock_genai_client.aio.models.generate_content.assert_awaited_once()


@pytest.mark.asyncio
async def test_gemini_successful_inference_base64(mock_gemini_response_payload):
    """Verify Gemini client accepts base64-encoded string and decodes it without error."""
    client = GeminiVisionClient(api_key="mock_valid_key")

    mock_resp = MagicMock()
    mock_resp.text = f"```json\n{json.dumps(mock_gemini_response_payload)}\n```"

    mock_genai_client = MagicMock()
    mock_genai_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)
    client._client = mock_genai_client

    b64_str = base64.b64encode(b"sample_test_image_bytes").decode("utf-8")
    result = await client.analyze_product_image(b64_str)

    assert result["product_type"] == "Handcrafted Blue Pottery Floral Vase"
    assert result["suggested_primary_category"] == "Home Decor & Living"


@pytest.mark.asyncio
async def test_gemini_timeout_error():
    """Verify Gemini timeout raises ExternalServiceError."""
    client = GeminiVisionClient(api_key="mock_valid_key", timeout=0.1)

    mock_genai_client = MagicMock()
    mock_genai_client.aio.models.generate_content = AsyncMock(side_effect=TimeoutError("Request timed out"))
    client._client = mock_genai_client

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image(b"fake_image_bytes")

    assert "timed out" in str(exc_info.value.message).lower()


@pytest.mark.asyncio
async def test_gemini_auth_error():
    """Verify Gemini 403 / API_KEY_INVALID raises clean ExternalServiceError."""
    client = GeminiVisionClient(api_key="mock_invalid_key")

    mock_genai_client = MagicMock()
    mock_genai_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("403 API_KEY_INVALID: User API key is not valid")
    )
    client._client = mock_genai_client

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image(b"fake_image_bytes")

    assert "invalid or unauthorized" in str(exc_info.value.message).lower()


@pytest.mark.asyncio
async def test_gemini_quota_exhausted_error():
    """Verify Gemini 429 RESOURCE_EXHAUSTED raises clean ExternalServiceError."""
    client = GeminiVisionClient(api_key="mock_valid_key")

    mock_genai_client = MagicMock()
    mock_genai_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("429 RESOURCE_EXHAUSTED: Rate limit exceeded")
    )
    client._client = mock_genai_client

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image(b"fake_image_bytes")

    assert "quota exhausted" in str(exc_info.value.message).lower()


@pytest.mark.asyncio
async def test_gemini_malformed_json_error():
    """Verify non-JSON response raises ExternalServiceError."""
    client = GeminiVisionClient(api_key="mock_valid_key")

    mock_resp = MagicMock()
    mock_resp.text = "This is not valid json at all!"

    mock_genai_client = MagicMock()
    mock_genai_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)
    client._client = mock_genai_client

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image(b"fake_image_bytes")

    assert "malformed or non-conforming json" in str(exc_info.value.message).lower()


@pytest.mark.asyncio
async def test_gemini_empty_response_error():
    """Verify empty response raises ExternalServiceError."""
    client = GeminiVisionClient(api_key="mock_valid_key")

    mock_resp = MagicMock()
    mock_resp.text = "   "

    mock_genai_client = MagicMock()
    mock_genai_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)
    client._client = mock_genai_client

    with pytest.raises(ExternalServiceError) as exc_info:
        await client.analyze_product_image(b"fake_image_bytes")

    assert "empty response content" in str(exc_info.value.message).lower()
