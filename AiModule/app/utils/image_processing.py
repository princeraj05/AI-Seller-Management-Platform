"""
Image Processing, Validation, and Preprocessing Utilities.
Ensures uploaded product images are secure, validated, correctly oriented, and normalized for AI models.
"""
import base64
import io
from typing import Tuple
from PIL import Image, ImageOps

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.schemas.vision import ImageMetadata

# Set decompression bomb threshold to 100 Million pixels (~10k x 10k)
Image.MAX_IMAGE_PIXELS = 100_000_000


def validate_image_bytes(data: bytes, filename: str = "upload.jpg") -> Tuple[Image.Image, ImageMetadata]:
    """
    Validate raw image bytes for corruption, size limits, format, and dimensions.
    Returns the loaded PIL Image and structured ImageMetadata.
    """
    settings = get_settings()

    # 1. Check empty content
    if not data or len(data) == 0:
        raise ValidationError(message="Uploaded image file is empty.", details={"filename": filename})

    # 2. Check maximum byte size
    max_bytes = settings.IMAGE_MAX_SIZE_MB * 1024 * 1024
    if len(data) > max_bytes:
        raise ValidationError(
            message=f"Image size exceeds the maximum limit of {settings.IMAGE_MAX_SIZE_MB}MB.",
            details={"size_bytes": len(data), "max_allowed_bytes": max_bytes, "filename": filename},
        )

    # 3. Decode image and verify format
    try:
        buffer = io.BytesIO(data)
        img = Image.open(buffer)
        raw_format = (img.format or "").upper()
    except Exception as exc:
        raise ValidationError(
            message="Corrupted or invalid image data. Unable to decode image.",
            details={"error": str(exc), "filename": filename},
        ) from exc

    # 4. Enforce allowed image formats
    allowed_formats = {fmt.upper() for fmt in settings.IMAGE_ALLOWED_FORMATS}
    norm_format = "JPEG" if raw_format == "JPG" else raw_format
    if norm_format not in allowed_formats:
        raise ValidationError(
            message=f"Unsupported image format '{raw_format}'. Allowed formats: {sorted(list(allowed_formats))}",
            details={"detected_format": raw_format, "allowed_formats": list(allowed_formats)},
        )

    # 5. Enforce dimension bounds
    width, height = img.size
    if width <= 0 or height <= 0:
        raise ValidationError(message="Invalid image dimensions (zero or negative).")

    if width > settings.IMAGE_MAX_WIDTH or height > settings.IMAGE_MAX_HEIGHT:
        raise ValidationError(
            message=f"Image dimensions ({width}x{height}) exceed maximum allowed ({settings.IMAGE_MAX_WIDTH}x{settings.IMAGE_MAX_HEIGHT}).",
            details={"width": width, "height": height},
        )

    # Check for EXIF metadata
    has_exif = hasattr(img, "_getexif") and img._getexif() is not None

    metadata = ImageMetadata(
        width=width,
        height=height,
        format=norm_format,
        size_bytes=len(data),
        aspect_ratio=round(width / height, 2),
        has_exif=has_exif,
        channels=len(img.getbands()),
    )

    img.load()
    return img, metadata


def preprocess_image(img: Image.Image, max_dim: int = 1536) -> Tuple[Image.Image, bytes, str]:
    """
    Normalize image for AI models:
    1. Transpose EXIF orientation so rotated phone photos appear upright.
    2. Convert color space to RGB (handles RGBA, P, CMYK).
    3. Downsample images exceeding max_dim while preserving aspect ratio.
    4. Encode to high-quality JPEG bytes and Base64 string.
    """
    # 1. Correct EXIF orientation
    try:
        oriented_img = ImageOps.exif_transpose(img)
    except Exception:
        oriented_img = img

    # 2. Normalize to RGB
    if oriented_img.mode != "RGB":
        if oriented_img.mode in ("RGBA", "LA") or (oriented_img.mode == "P" and "transparency" in oriented_img.info):
            background = Image.new("RGB", oriented_img.size, (255, 255, 255))
            alpha_img = oriented_img.convert("RGBA")
            background.paste(alpha_img, mask=alpha_img.split()[-1])
            rgb_img = background
        else:
            rgb_img = oriented_img.convert("RGB")
    else:
        rgb_img = oriented_img

    # 3. Downsample if dimensions exceed max_dim (preserving aspect ratio)
    width, height = rgb_img.size
    if max(width, height) > max_dim:
        scale = max_dim / max(width, height)
        new_width = max(1, int(width * scale))
        new_height = max(1, int(height * scale))
        processed_img = rgb_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    else:
        processed_img = rgb_img

    # 4. Encode to JPEG bytes
    out_buffer = io.BytesIO()
    processed_img.save(out_buffer, format="JPEG", quality=90, optimize=True)
    jpeg_bytes = out_buffer.getvalue()

    # 5. Encode to Base64 string for vision API payloads
    base64_str = base64.b64encode(jpeg_bytes).decode("utf-8")

    return processed_img, jpeg_bytes, base64_str
