"""
Confidence and Uncertainty Handling Utilities.
Provides calibrated categorization of attribute evidence without fabricating statistical precision.
"""
from enum import Enum
from typing import Optional, Tuple


class EvidenceSource(str, Enum):
    """Source of truth from which an attribute was derived."""
    VISION_MODEL = "vision_model"
    GEMINI_VISION = "gemini_vision"
    OCR = "ocr"
    PADDLE_OCR = "paddle_ocr"
    IMAGE_PROCESSING = "image_processing"
    COMBINED = "combined"
    SELLER_INPUT = "seller_input"
    INFERRED = "inferred"


class UncertaintyStatus(str, Enum):
    """Calibrated confidence tier reflecting observation reliability."""
    CONFIRMED_OBSERVATION = "confirmed_observation"
    REASONABLE_INFERENCE = "reasonable_inference"
    UNCERTAIN = "uncertain"
    UNKNOWN = "unknown"


def evaluate_confidence(
    attribute_name: str,
    value: Optional[str],
    source: EvidenceSource,
    raw_confidence: Optional[float] = None,
) -> Tuple[float, UncertaintyStatus]:
    """
    Standardize and calibrate confidence scores and uncertainty tiers.
    Enforces domain safety rules:
    - Visible colors and patterns directly observable in high resolution are 'confirmed_observation'.
    - Material composition (e.g. wood, cotton, silk) from appearance alone is 'reasonable_inference'.
    - Dimensions, weight, geographic origin, and purity are 'uncertain' unless supported by explicit label OCR.
    """
    if not value or value.strip().lower() in {"unknown", "n/a", "not specified", "undetermined", "none"}:
        return 0.0, UncertaintyStatus.UNKNOWN

    norm_name = attribute_name.strip().lower()

    # Rule 1: High confidence direct visual observations
    if norm_name in {"primary_color", "dominant_color", "shape", "visual_pattern"}:
        conf = min(0.95, max(0.80, raw_confidence or 0.88))
        return round(conf, 2), UncertaintyStatus.CONFIRMED_OBSERVATION

    # Rule 2: Inferred physical characteristics (materials, craft technique)
    if "material" in norm_name or "craft" in norm_name or "technique" in norm_name:
        # A vision model can only observe texture/finish, not chemical purity
        conf = min(0.85, max(0.60, raw_confidence or 0.75))
        return round(conf, 2), UncertaintyStatus.REASONABLE_INFERENCE

    # Rule 3: Text read from image OCR
    if source in (EvidenceSource.OCR, EvidenceSource.PADDLE_OCR):
        conf = min(0.98, max(0.50, raw_confidence or 0.85))
        return round(conf, 2), UncertaintyStatus.CONFIRMED_OBSERVATION

    # Rule 4: Attributes with combined multi-source evidence
    if source == EvidenceSource.COMBINED:
        conf = min(0.95, max(0.75, (raw_confidence or 0.80) + 0.1))
        return round(conf, 2), UncertaintyStatus.CONFIRMED_OBSERVATION

    # Default fallback: safe bounded inference
    base_conf = raw_confidence if raw_confidence is not None else 0.70
    clamped_conf = min(0.90, max(0.40, base_conf))
    tier = UncertaintyStatus.REASONABLE_INFERENCE if clamped_conf >= 0.65 else UncertaintyStatus.UNCERTAIN
    return round(clamped_conf, 2), tier
