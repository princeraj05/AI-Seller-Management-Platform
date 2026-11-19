"""
Integration tests for Vision and Product Intelligence API endpoints.
"""
import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.schemas.vision import (
    CategoryPrediction,
    ImageMetadata,
    OcrResult,
    ProductIntelligenceResult,
)
from app.services.product_intelligence_service import ProductIntelligenceService


def create_sample_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (120, 120), color="coral")
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_vision_status_endpoint_authenticated(client: TestClient):
    """Verify GET /api/v1/vision/status returns 200 with engine diagnostics."""
    headers = {
        "X-Internal-Service-Key": "test_internal_secret_key_1234567890_32chars",
    }
    response = client.get("/api/v1/vision/status", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "vision_provider" in data["data"]
    assert "ocr_engine" in data["data"]
    assert data["data"]["ocr_engine"] == "PaddleOCR"


def test_vision_status_unauthenticated(client: TestClient):
    """Verify GET /api/v1/vision/status rejects unauthenticated requests."""
    response = client.get("/api/v1/vision/status")
    assert response.status_code == 401


def test_extract_attributes_missing_auth(client: TestClient):
    """Verify POST /api/v1/vision/extract-attributes rejects missing internal key."""
    img_bytes = create_sample_jpeg_bytes()
    files = {"file": ("product.jpg", img_bytes, "image/jpeg")}
    response = client.post("/api/v1/vision/extract-attributes", files=files)
    assert response.status_code == 401


def test_extract_attributes_missing_seller_context(client: TestClient):
    """Verify POST /api/v1/vision/extract-attributes rejects missing X-Seller-ID."""
    headers = {
        "X-Internal-Service-Key": "test_internal_secret_key_1234567890_32chars",
    }
    img_bytes = create_sample_jpeg_bytes()
    files = {"file": ("product.jpg", img_bytes, "image/jpeg")}
    response = client.post("/api/v1/vision/extract-attributes", headers=headers, files=files)
    assert response.status_code == 403


def test_extract_attributes_empty_file_rejected(client: TestClient):
    """Verify uploading an empty file returns validation error."""
    headers = {
        "X-Internal-Service-Key": "test_internal_secret_key_1234567890_32chars",
        "X-Seller-ID": "seller_abc123",
    }
    files = {"file": ("empty.jpg", b"", "image/jpeg")}
    response = client.post("/api/v1/vision/extract-attributes", headers=headers, files=files)
    assert response.status_code == 422


def test_extract_attributes_success(client: TestClient, monkeypatch):
    """Verify successful end-to-end multipart upload and structured response."""
    mock_result = ProductIntelligenceResult(
        product_type="Handmade Terracotta Diya",
        visual_description="Earthen clay lamp with hand-carved floral rim",
        multiple_products_detected=False,
        category=CategoryPrediction(
            primary_category="Home Decor & Living",
            subcategory="Candle Holders",
            alternative_categories=["Festival Items"],
            confidence=0.88,
            uncertainty_status="confirmed_observation",
            reasoning="Clay oil lamp design with ornamental rim.",
        ),
        attributes=[],
        ocr=OcrResult(
            status="no_text_detected",
            extracted_text="",
            segments=[],
            segment_count=0,
            engine="PaddleOCR",
            execution_time_ms=5.0,
        ),
        uncertainties=[],
        image_metadata=ImageMetadata(
            width=120,
            height=120,
            format="JPEG",
            size_bytes=1024,
            aspect_ratio=1.0,
            has_exif=False,
            channels=3,
        ),
        processing_metadata={"test": True},
    )

    async def mock_analyze(self, image_bytes, filename="product.jpg", enable_ocr=True, user_hint=None):
        return mock_result

    monkeypatch.setattr(ProductIntelligenceService, "analyze_product", mock_analyze)

    headers = {
        "X-Internal-Service-Key": "test_internal_secret_key_1234567890_32chars",
        "X-Seller-ID": "seller_abc123",
        "X-Store-ID": "store_xyz789",
    }
    img_bytes = create_sample_jpeg_bytes()
    files = {"file": ("diya.jpg", img_bytes, "image/jpeg")}
    data = {"enable_ocr": "true", "user_hint": "Handcrafted clay diya"}

    response = client.post(
        "/api/v1/vision/extract-attributes",
        headers=headers,
        files=files,
        data=data,
    )

    assert response.status_code == 200
    res_json = response.json()
    assert res_json["success"] is True
    assert res_json["data"]["product_type"] == "Handmade Terracotta Diya"
    assert res_json["data"]["category"]["primary_category"] == "Home Decor & Living"
    assert res_json["data"]["category"]["subcategory"] == "Candle Holders"
    assert "X-Request-ID" in response.headers
