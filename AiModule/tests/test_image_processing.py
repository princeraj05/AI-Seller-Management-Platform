"""
Unit tests for Image Processing, Validation, and Preprocessing Utilities.
"""
import io
import pytest
from PIL import Image

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.utils.image_processing import preprocess_image, validate_image_bytes


def create_test_image(format_name: str = "JPEG", size=(200, 200), color="blue", mode="RGB") -> bytes:
    """Helper to generate in-memory image bytes."""
    buf = io.BytesIO()
    img = Image.new(mode, size, color=color)
    img.save(buf, format=format_name)
    return buf.getvalue()


def test_valid_jpeg_validation():
    """Verify standard JPEG image is successfully validated."""
    data = create_test_image("JPEG", (300, 400), "red")
    img, meta = validate_image_bytes(data, "test.jpg")
    assert meta.format == "JPEG"
    assert meta.width == 300
    assert meta.height == 400
    assert meta.aspect_ratio == 0.75
    assert meta.size_bytes == len(data)


def test_valid_png_validation():
    """Verify PNG image is successfully validated."""
    data = create_test_image("PNG", (150, 150), "green")
    img, meta = validate_image_bytes(data, "test.png")
    assert meta.format == "PNG"
    assert meta.width == 150
    assert meta.height == 150


def test_valid_webp_validation():
    """Verify WebP image is successfully validated."""
    data = create_test_image("WEBP", (250, 300), "yellow")
    img, meta = validate_image_bytes(data, "test.webp")
    assert meta.format == "WEBP"
    assert meta.width == 250
    assert meta.height == 300


def test_empty_image_rejected():
    """Verify empty byte stream is rejected with ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        validate_image_bytes(b"", "empty.jpg")
    assert "empty" in str(exc_info.value.message).lower()


def test_corrupted_image_rejected():
    """Verify corrupted non-image bytes are rejected with ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        validate_image_bytes(b"this_is_not_an_image_file_at_all_1234567890", "corrupt.jpg")
    assert "invalid image data" in str(exc_info.value.message).lower()


def test_unsupported_format_rejected():
    """Verify unsupported image formats (e.g. BMP) are rejected."""
    buf = io.BytesIO()
    img = Image.new("RGB", (50, 50), color="white")
    img.save(buf, format="BMP")
    bmp_bytes = buf.getvalue()

    with pytest.raises(ValidationError) as exc_info:
        validate_image_bytes(bmp_bytes, "test.bmp")
    assert "unsupported image format" in str(exc_info.value.message).lower()


def test_oversized_image_rejected(monkeypatch):
    """Verify images exceeding IMAGE_MAX_SIZE_MB are rejected."""
    settings = get_settings()
    monkeypatch.setattr(settings, "IMAGE_MAX_SIZE_MB", 1)  # 1 MB threshold
    data = b"x" * (2 * 1024 * 1024)  # 2 MB fake data

    with pytest.raises(ValidationError) as exc_info:
        validate_image_bytes(data, "large.jpg")
    assert "exceeds the maximum limit" in str(exc_info.value.message).lower()


def test_rgba_to_rgb_conversion():
    """Verify RGBA transparent images are cleanly normalized to RGB."""
    rgba_bytes = create_test_image("PNG", (100, 100), (255, 0, 0, 128), mode="RGBA")
    pil_img, _ = validate_image_bytes(rgba_bytes, "test.png")
    assert pil_img.mode == "RGBA"

    processed, jpeg_bytes, b64_str = preprocess_image(pil_img)
    assert processed.mode == "RGB"
    assert len(jpeg_bytes) > 0
    assert len(b64_str) > 0


def test_image_resizing_aspect_ratio_preserved():
    """Verify images exceeding max_dim are downscaled while preserving aspect ratio."""
    # 2000 x 1000 image -> ratio is 2.0
    large_bytes = create_test_image("JPEG", (2000, 1000), "purple")
    pil_img, _ = validate_image_bytes(large_bytes, "test.jpg")

    processed, jpeg_bytes, b64_str = preprocess_image(pil_img, max_dim=1000)
    assert max(processed.size) <= 1000
    assert processed.size[0] == 1000
    assert processed.size[1] == 500
