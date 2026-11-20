"""
Unit tests for Product Intelligence Engine and Taxonomy Mapping.
"""
import io
import pytest
from PIL import Image

from app.integrations.ollama_client import OllamaVisionClient
from app.schemas.vision import OcrResult, OcrTextSegment
from app.services.ocr_service import OcrService
from app.services.product_intelligence_service import ProductIntelligenceService
from app.utils.confidence import UncertaintyStatus


@pytest.fixture
def sample_image_bytes() -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (300, 300), color="tan")
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_product_intelligence_orchestration(sample_image_bytes, monkeypatch):
    """Verify end-to-end intelligence synthesis combining vision model and OCR."""
    mock_vision_data = {
        "product_type": "Handcrafted Wooden Spice Box",
        "visual_description": "Sheesham wood masala box with 9 compartments and glass lid",
        "multiple_products_detected": False,
        "suggested_primary_category": "Home Decor",
        "suggested_subcategory": "Storage Box",
        "primary_color": "Brown",
        "secondary_colors": ["Clear"],
        "apparent_material": "Wood with natural grain",
        "pattern": "Wood grain",
        "shape": "Square",
        "craft_technique": "Handmade carpentry",
        "decorative_elements": ["Brass knob"],
        "uncertainties": ["Exact wood species"],
    }

    mock_ocr = OcrResult(
        status="success",
        extracted_text="Jaipur Crafts\nMRP 899",
        segments=[
            OcrTextSegment(text="Jaipur Crafts", confidence=0.95),
            OcrTextSegment(text="MRP 899", confidence=0.88),
        ],
        segment_count=2,
        engine="PaddleOCR",
        execution_time_ms=15.0,
    )

    class MockVisionClient(OllamaVisionClient):
        async def analyze_product_image(self, b64_img, user_hint=None):
            return mock_vision_data

    class MockOcrService(OcrService):
        async def extract_text_from_image(self, img, enabled=True):
            return mock_ocr

    service = ProductIntelligenceService(
        vision_client=MockVisionClient(),
        ocr_service=MockOcrService(),
    )

    result = await service.analyze_product(sample_image_bytes, filename="spice_box.jpg")
    assert result.product_type == "Handcrafted Wooden Spice Box"
    assert result.category.primary_category == "Home Decor & Living"
    assert result.category.subcategory == "Storage & Boxes"
    assert result.multiple_products_detected is False

    # Check attribute synthesis
    attr_names = {a.name for a in result.attributes}
    assert "primary_color" in attr_names
    assert "visible_material" in attr_names
    assert "visible_label_text" in attr_names

    # Check that material is marked as reasonable_inference, not 100% confirmed
    mat_attr = next(a for a in result.attributes if a.name == "visible_material")
    assert mat_attr.uncertainty_status == UncertaintyStatus.REASONABLE_INFERENCE.value

    # Check image metadata
    assert result.image_metadata.width == 300
    assert result.image_metadata.height == 300


def test_category_prediction_rules():
    """Verify taxonomy category prediction based on product keywords."""
    service = ProductIntelligenceService()

    # Test 1: Kurta -> Fashion & Apparel
    pred1 = service.predict_category("Handblock Printed Cotton Kurta")
    assert pred1.primary_category == "Fashion & Apparel"
    assert pred1.subcategory == "Kurtas & Tops"

    # Test 2: Jewelry -> Jewelry & Accessories
    pred2 = service.predict_category("Kundan Meenakari Jhumka Earrings")
    assert pred2.primary_category == "Jewelry & Accessories"
    assert pred2.subcategory == "Earrings & Jhumkas"

    # Test 3: Wall Hanging -> Home Decor
    pred3 = service.predict_category("Traditional Macrame Wall Hanging")
    assert pred3.primary_category == "Home Decor & Living"
    assert pred3.subcategory == "Wall Art & Hangings"


@pytest.mark.asyncio
async def test_multiple_products_detected_flag(sample_image_bytes, monkeypatch):
    """Verify warning is added to uncertainties when multiple distinct items appear."""
    mock_multi = {
        "product_type": "Assorted Pottery Set",
        "visual_description": "Three ceramic mugs and a teapot displayed together",
        "multiple_products_detected": True,
        "suggested_primary_category": "Kitchen & Dining",
        "suggested_subcategory": "Drinkware",
        "primary_color": "Blue",
        "uncertainties": [],
    }

    class MockVisionClient(OllamaVisionClient):
        async def analyze_product_image(self, b64_img, user_hint=None):
            return mock_multi

    service = ProductIntelligenceService(vision_client=MockVisionClient())
    result = await service.analyze_product(sample_image_bytes, enable_ocr=False)

    assert result.multiple_products_detected is True
    assert any("Multiple distinct products appear" in u for u in result.uncertainties)
