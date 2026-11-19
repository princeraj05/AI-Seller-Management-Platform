"""
Unit tests for Optical Character Recognition (OCR) Service.
"""
import pytest
from PIL import Image
from app.services.ocr_service import OcrService


@pytest.mark.asyncio
async def test_ocr_disabled():
    """Verify OCR returns disabled status when explicitly disabled."""
    service = OcrService()
    img = Image.new("RGB", (100, 100), color="white")
    result = await service.extract_text_from_image(img, enabled=False)
    assert result.status == "disabled"
    assert result.extracted_text == ""
    assert result.segment_count == 0


@pytest.mark.asyncio
async def test_ocr_when_paddle_not_installed(monkeypatch):
    """Verify graceful handling when PaddleOCR library is not installed."""
    service = OcrService()
    monkeypatch.setattr(service, "is_available", lambda: False)

    img = Image.new("RGB", (100, 100), color="white")
    result = await service.extract_text_from_image(img, enabled=True)
    assert result.status == "unavailable"
    assert "Not Installed" in result.engine
    assert result.segment_count == 0


@pytest.mark.asyncio
async def test_ocr_success_mock(monkeypatch):
    """Verify structured OCR segments parsing with mock engine."""
    service = OcrService()
    monkeypatch.setattr(service, "is_available", lambda: True)

    class MockPaddleEngine:
        def ocr(self, img_np, cls=True):
            # Mock return format: [ [ [box, (text, conf)] ] ]
            return [
                [
                    [[[0, 0], [50, 0], [50, 20], [0, 20]], ("Bhartiye Crafts", 0.96)],
                    [[[0, 30], [80, 30], [80, 50], [0, 50]], ("100% Handcrafted", 0.91)],
                ]
            ]

    monkeypatch.setattr(service, "_get_engine", lambda: MockPaddleEngine())

    img = Image.new("RGB", (200, 100), color="white")
    result = await service.extract_text_from_image(img, enabled=True)
    assert result.status == "success"
    assert result.segment_count == 2
    assert "Bhartiye Crafts" in result.extracted_text
    assert "100% Handcrafted" in result.extracted_text
    assert result.segments[0].confidence == 0.96


@pytest.mark.asyncio
async def test_ocr_no_text_detected_mock(monkeypatch):
    """Verify no_text_detected status when image has no recognized text."""
    service = OcrService()
    monkeypatch.setattr(service, "is_available", lambda: True)

    class MockPaddleEngineEmpty:
        def ocr(self, img_np, cls=True):
            return [[]]

    monkeypatch.setattr(service, "_get_engine", lambda: MockPaddleEngineEmpty())

    img = Image.new("RGB", (100, 100), color="white")
    result = await service.extract_text_from_image(img, enabled=True)
    assert result.status == "no_text_detected"
    assert result.segment_count == 0
    assert result.extracted_text == ""
