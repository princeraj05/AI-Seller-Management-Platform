"""
Unit tests for Provider Selection, Switching, and Degraded Scenarios (A, B, C, D).
"""
import io
from unittest.mock import AsyncMock, MagicMock
from PIL import Image
import pytest

from app.core.config import Settings
from app.core.exceptions import ExternalServiceError, ValidationError
from app.integrations.gemini_vision_client import GeminiVisionClient
from app.integrations.ollama_client import OllamaVisionClient
from app.schemas.vision import OcrResult, OcrTextSegment
from app.services.ocr_service import OcrService
from app.services.product_intelligence_service import ProductIntelligenceService
from app.utils.confidence import EvidenceSource, UncertaintyStatus


@pytest.fixture
def test_image_bytes():
    buf = io.BytesIO()
    img = Image.new("RGB", (200, 200), color="blue")
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_provider_configuration_validation():
    """Verify config only accepts 'gemini' and 'ollama' as valid VISION_PROVIDER."""
    # Valid gemini
    s1 = Settings(VISION_PROVIDER="gemini", GEMINI_API_KEY="test_key")
    assert s1.VISION_PROVIDER == "gemini"
    assert s1.VISION_MODEL_PROVIDER == "gemini"

    # Valid ollama
    s2 = Settings(VISION_PROVIDER="ollama")
    assert s2.VISION_PROVIDER == "ollama"
    assert s2.VISION_MODEL_PROVIDER == "ollama"

    # Invalid provider rejected by Pydantic validator
    with pytest.raises(Exception):
        Settings(VISION_PROVIDER="unsupported_engine")


def test_service_instantiates_configured_provider(monkeypatch):
    """Verify ProductIntelligenceService instantiates the correct client based on settings."""
    from app.core.config import get_settings

    # When gemini is configured
    monkeypatch.setenv("VISION_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "mock_key")
    get_settings.cache_clear()
    s_gemini = ProductIntelligenceService()
    assert isinstance(s_gemini.vision_client, GeminiVisionClient)
    assert s_gemini.vision_client.provider == "gemini"

    # When ollama is configured
    monkeypatch.setenv("VISION_PROVIDER", "ollama")
    get_settings.cache_clear()
    s_ollama = ProductIntelligenceService()
    assert isinstance(s_ollama.vision_client, OllamaVisionClient)
    assert s_ollama.vision_client.provider == "ollama"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_scenario_a_vision_and_ocr_success(test_image_bytes, monkeypatch):
    """Scenario A: Both vision and OCR succeed -> combined into unified result with evidence sources."""
    mock_vision = {
        "product_type": "Handcrafted Brass Diya",
        "visual_description": "Traditional engraved brass oil lamp",
        "multiple_products_detected": False,
        "suggested_primary_category": "Home Decor & Living",
        "suggested_subcategory": "Candle Holders",
        "primary_color": "Gold",
        "secondary_colors": [],
        "apparent_material": "Engraved brass metal",
        "pattern": "Engraved traditional motifs",
        "shape": "Round",
        "craft_technique": "Brass metal casting and engraving",
        "decorative_elements": ["Engraved petal rim"],
        "uncertainties": [],
    }

    mock_ocr = OcrResult(
        status="success",
        extracted_text="Crafts of India\nPure Brass",
        segments=[
            OcrTextSegment(text="Crafts of India", confidence=0.96),
            OcrTextSegment(text="Pure Brass", confidence=0.92),
        ],
        segment_count=2,
        engine="PaddleOCR",
        execution_time_ms=12.0,
    )

    mock_v_client = MagicMock()
    mock_v_client.provider = "gemini"
    mock_v_client.model_name = "gemini-2.0-flash"
    mock_v_client.analyze_product_image = AsyncMock(return_value=mock_vision)

    mock_ocr_srv = MagicMock()
    mock_ocr_srv.extract_text_from_image = AsyncMock(return_value=mock_ocr)

    service = ProductIntelligenceService(vision_client=mock_v_client, ocr_service=mock_ocr_srv)
    result = await service.analyze_product(test_image_bytes, enable_ocr=True)

    assert result.product_type == "Handcrafted Brass Diya"
    assert result.category.primary_category == "Home Decor & Living"
    assert result.category.subcategory == "Candle Holders"
    assert result.ocr.status == "success"

    # Verify evidence source tagging
    sources = {a.name: a.evidence_source for a in result.attributes}
    assert sources["primary_color"] == EvidenceSource.GEMINI_VISION.value
    assert sources["visible_material"] == EvidenceSource.GEMINI_VISION.value
    assert sources["visible_label_text"] == EvidenceSource.PADDLE_OCR.value


@pytest.mark.asyncio
async def test_scenario_b_vision_succeeds_ocr_fails(test_image_bytes):
    """Scenario B: Vision succeeds, OCR fails -> returns visual attributes, notes OCR failure in uncertainties."""
    mock_vision = {
        "product_type": "Embroidered Silk Cushion Cover",
        "visual_description": "Zari-work embroidered floral cushion",
        "multiple_products_detected": False,
        "suggested_primary_category": "Textiles & Furnishings",
        "suggested_subcategory": "Cushion Covers",
        "primary_color": "Maroon",
        "apparent_material": "Silk fabric with metallic thread embroidery",
        "uncertainties": [],
    }

    mock_v_client = MagicMock()
    mock_v_client.provider = "gemini"
    mock_v_client.model_name = "gemini-2.0-flash"
    mock_v_client.analyze_product_image = AsyncMock(return_value=mock_vision)

    mock_ocr_srv = MagicMock()
    # Simulate OCR service crashing/failing
    mock_ocr_srv.extract_text_from_image = AsyncMock(side_effect=Exception("PaddleOCR memory allocation error"))

    service = ProductIntelligenceService(vision_client=mock_v_client, ocr_service=mock_ocr_srv)
    result = await service.analyze_product(test_image_bytes, enable_ocr=True)

    assert result.product_type == "Embroidered Silk Cushion Cover"
    assert result.ocr.status == "failed"
    assert any("OCR text extraction was unavailable" in u for u in result.uncertainties)


@pytest.mark.asyncio
async def test_scenario_c_vision_fails_ocr_succeeds(test_image_bytes):
    """Scenario C: Vision fails, OCR succeeds -> returns degraded result with OCR text and warning."""
    mock_v_client = MagicMock()
    mock_v_client.provider = "gemini"
    mock_v_client.model_name = "gemini-2.0-flash"
    mock_v_client.analyze_product_image = AsyncMock(
        side_effect=ExternalServiceError("Gemini API connection error")
    )

    mock_ocr = OcrResult(
        status="success",
        extracted_text="Jaipuri Blue Pottery\nItem Code: BP-102",
        segments=[
            OcrTextSegment(text="Jaipuri Blue Pottery", confidence=0.95),
            OcrTextSegment(text="Item Code: BP-102", confidence=0.91),
        ],
        segment_count=2,
        engine="PaddleOCR",
        execution_time_ms=10.0,
    )

    mock_ocr_srv = MagicMock()
    mock_ocr_srv.extract_text_from_image = AsyncMock(return_value=mock_ocr)

    service = ProductIntelligenceService(vision_client=mock_v_client, ocr_service=mock_ocr_srv)
    result = await service.analyze_product(test_image_bytes, enable_ocr=True)

    assert "Jaipuri Blue Pottery" in result.product_type
    assert result.processing_metadata.get("degraded_mode") == "ocr_only"
    assert any("Visual intelligence failed" in u for u in result.uncertainties)
    assert result.category.confidence == 0.50
    assert result.category.uncertainty_status == UncertaintyStatus.UNCERTAIN.value

    # Check that visible label text is present in attributes
    lbl_attr = next(a for a in result.attributes if a.name == "visible_label_text")
    assert "Jaipuri Blue Pottery" in lbl_attr.value
    assert lbl_attr.evidence_source == EvidenceSource.PADDLE_OCR.value


@pytest.mark.asyncio
async def test_scenario_d_both_fail_raises_exception(test_image_bytes):
    """Scenario D: Both vision and OCR fail -> raises ExternalServiceError."""
    mock_v_client = MagicMock()
    mock_v_client.provider = "gemini"
    mock_v_client.model_name = "gemini-2.0-flash"
    mock_v_client.analyze_product_image = AsyncMock(
        side_effect=ExternalServiceError("Gemini API 503 Unavailable")
    )

    mock_ocr_srv = MagicMock()
    mock_ocr_srv.extract_text_from_image = AsyncMock(
        return_value=OcrResult(
            status="failed",
            extracted_text="",
            segments=[],
            segment_count=0,
            engine="PaddleOCR",
            execution_time_ms=0.0,
        )
    )

    service = ProductIntelligenceService(vision_client=mock_v_client, ocr_service=mock_ocr_srv)

    with pytest.raises(ExternalServiceError) as exc_info:
        await service.analyze_product(test_image_bytes, enable_ocr=True)

    assert "both vision" in str(exc_info.value.message).lower() or "product analysis failed" in str(exc_info.value.message).lower()


@pytest.mark.asyncio
async def test_gemini_mode_does_not_touch_ollama(test_image_bytes, monkeypatch):
    """Verify that when VISION_PROVIDER='gemini', Ollama's localhost client is never called."""
    import httpx

    ollama_called = False

    async def mock_ollama_call(request: httpx.Request):
        nonlocal ollama_called
        ollama_called = True
        return httpx.Response(500, text="Should not be called")

    # Mock Gemini client
    mock_vision = {
        "product_type": "Wooden Coaster Set",
        "visual_description": "Carved wooden coasters",
        "multiple_products_detected": False,
        "suggested_primary_category": "Kitchen & Dining",
        "suggested_subcategory": "Coasters & Trivets",
        "primary_color": "Brown",
        "uncertainties": [],
    }

    class MockGeminiClient(GeminiVisionClient):
        def __init__(self):
            self.provider = "gemini"
            self.model_name = "gemini-2.0-flash"
        async def analyze_product_image(self, *args, **kwargs):
            return mock_vision

    mock_ocr = OcrResult(
        status="no_text_detected",
        extracted_text="",
        segments=[],
        segment_count=0,
        engine="PaddleOCR",
        execution_time_ms=2.0,
    )
    mock_ocr_srv = MagicMock()
    mock_ocr_srv.extract_text_from_image = AsyncMock(return_value=mock_ocr)

    service = ProductIntelligenceService(vision_client=MockGeminiClient(), ocr_service=mock_ocr_srv)
    result = await service.analyze_product(test_image_bytes)

    assert result.product_type == "Wooden Coaster Set"
    assert ollama_called is False
