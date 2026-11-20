"""
Pydantic Schemas for Computer Vision, OCR, and Product Intelligence.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ImageMetadata(BaseModel):
    """Extracted physical and encoding properties of the uploaded image."""

    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    format: str = Field(..., description="Image encoding format (JPEG, PNG, WEBP)")
    size_bytes: int = Field(..., description="File size in bytes")
    aspect_ratio: float = Field(..., description="Width-to-height ratio rounded to 2 decimal places")
    has_exif: bool = Field(default=False, description="Whether EXIF metadata was present")
    channels: int = Field(default=3, description="Color channels (3 for RGB, 4 for RGBA)")


class ExtractedAttribute(BaseModel):
    """Individual product attribute extracted via vision model, OCR, or combined analysis."""

    name: str = Field(..., description="Standardized attribute name (e.g. primary_color, visible_material, pattern, craft_technique, shape)")
    value: str = Field(..., description="Extracted or inferred attribute value")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Estimated confidence score between 0.0 and 1.0")
    evidence_source: str = Field(..., description="Source of evidence: vision_model, ocr, image_processing, combined, or inferred")
    uncertainty_status: str = Field(..., description="Uncertainty level: confirmed_observation, reasonable_inference, uncertain, or unknown")
    notes: Optional[str] = Field(default=None, description="Contextual explanation or qualification of the attribute")


class OcrTextSegment(BaseModel):
    """Individual recognized text bounding box and transcription."""

    text: str = Field(..., description="Transcribed text content")
    confidence: float = Field(..., ge=0.0, le=1.0, description="OCR confidence for this segment")
    bounding_box: Optional[List[List[float]]] = Field(default=None, description="Bounding polygon coordinates [[x1,y1], [x2,y2], ...]")


class OcrResult(BaseModel):
    """Aggregate OCR extraction results."""

    status: str = Field(..., description="OCR status: success, no_text_detected, disabled, or unavailable")
    extracted_text: str = Field(default="", description="Consolidated normalized text extracted from the image")
    segments: List[OcrTextSegment] = Field(default_factory=list, description="List of recognized individual text segments")
    segment_count: int = Field(default=0, description="Total number of text segments detected")
    engine: str = Field(default="PaddleOCR", description="OCR engine utilized")
    execution_time_ms: float = Field(default=0.0, description="OCR execution duration in milliseconds")


class CategoryPrediction(BaseModel):
    """Hierarchical product category suggestion with uncertainty evaluation."""

    primary_category: str = Field(..., description="Predicted high-level e-commerce catalog category")
    subcategory: str = Field(..., description="Predicted specific subcategory")
    alternative_categories: List[str] = Field(default_factory=list, description="Alternative plausible categories")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in primary prediction")
    uncertainty_status: str = Field(..., description="Uncertainty classification: confirmed_observation, reasonable_inference, or uncertain")
    reasoning: str = Field(..., description="Brief rationale based on visual characteristics")


class ProductIntelligenceResult(BaseModel):
    """Complete structured intelligence report for a handicraft product image."""

    product_type: str = Field(..., description="Identified product type (e.g. Handcrafted Wooden Jewelry Box)")
    visual_description: str = Field(..., description="Objective, grounded visual description of visible elements")
    multiple_products_detected: bool = Field(default=False, description="Flag indicating if multiple distinct items appear in the frame")
    category: CategoryPrediction = Field(..., description="Predicted product category taxonomy")
    attributes: List[ExtractedAttribute] = Field(default_factory=list, description="Structured visual attributes with evidence sources")
    ocr: OcrResult = Field(..., description="OCR text recognition findings")
    uncertainties: List[str] = Field(default_factory=list, description="List of visual ambiguities or undetermined specifications")
    image_metadata: ImageMetadata = Field(..., description="Image technical specifications")
    processing_metadata: Dict[str, Any] = Field(default_factory=dict, description="Model and engine execution diagnostics")


class HandicraftVisionOutput(BaseModel):
    """Pydantic schema used for structured multimodal vision output from Google Gemini / LLM."""

    product_type: str = Field(..., description="Specific handicraft item title or type (e.g. Handcrafted Terracotta Floral Vase)")
    visual_description: str = Field(..., description="Objective, grounded visual summary of visible elements, styling, and design")
    multiple_products_detected: bool = Field(default=False, description="True if multiple distinct products or staging sets are in the photo")
    suggested_primary_category: str = Field(..., description="Catalog primary category (e.g. Home Decor & Living, Fashion & Apparel, Jewelry & Accessories)")
    suggested_subcategory: str = Field(..., description="Catalog subcategory (e.g. Vases & Planters, Sarees & Ethnic Wear, Earrings & Jhumkas)")
    primary_color: str = Field(..., description="Dominant visible color of the main item")
    secondary_colors: List[str] = Field(default_factory=list, description="List of secondary visible colors")
    apparent_material: str = Field(..., description="Apparent surface material texture/finish (e.g. Terracotta clay, Brass metal, Teak wood, Cotton weave)")
    pattern: Optional[str] = Field(default=None, description="Visible surface pattern (e.g. Floral engraving, Sanganeri block print, Plain)")
    shape: Optional[str] = Field(default=None, description="Geometric or physical shape (e.g. Cylindrical, Bell-shaped, Round, Rectangular)")
    craft_technique: Optional[str] = Field(default=None, description="Artisanal craft technique observed (e.g. Hand Carving, Clay Firing, Block Printing)")
    decorative_elements: List[str] = Field(default_factory=list, description="Notable decorative details (e.g. Brass inlays, Jhumka bells, Glazed rim)")
    uncertainties: List[str] = Field(default_factory=list, description="Visual ambiguities, unverified material purity, or unconfirmed specs")
