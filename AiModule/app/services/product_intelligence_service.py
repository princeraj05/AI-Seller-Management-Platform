"""
Product Intelligence Service.
Orchestrates computer vision, OCR text recognition, attribute extraction, and taxonomy categorization.
"""
import asyncio
import time
from typing import Any, Dict, List, Optional
from PIL import Image

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger
from app.utils.cache import get_vision_cache
from app.integrations.gemini_vision_client import GeminiVisionClient
from app.integrations.ollama_client import OllamaVisionClient
from app.schemas.vision import (
    CategoryPrediction,
    ExtractedAttribute,
    ImageMetadata,
    OcrResult,
    ProductIntelligenceResult,
)
from app.services.ocr_service import OcrService, get_ocr_service
from app.utils.confidence import EvidenceSource, UncertaintyStatus, evaluate_confidence
from app.utils.image_processing import preprocess_image, validate_image_bytes

logger = get_logger("services.product_intelligence")

# Extensible E-Commerce Category Taxonomy Map for Handicraft Platforms
HANDICRAFT_TAXONOMY = {
    "Home Decor & Living": [
        "Storage & Boxes", "Wall Art & Hangings", "Vases & Planters",
        "Idols & Sculptures", "Lamps & Lighting", "Candle Holders", "Showpieces & Figurines"
    ],
    "Fashion & Apparel": [
        "Kurtas & Tops", "Sarees & Ethnic Wear", "Dupattas & Shawls",
        "Handmade Footwear & Juttis", "Jackets & Vests"
    ],
    "Jewelry & Accessories": [
        "Necklaces & Pendants", "Earrings & Jhumkas", "Bangles & Bracelets",
        "Handmade Bags & Clutches", "Hair Accessories"
    ],
    "Kitchen & Dining": [
        "Serveware & Bowls", "Drinkware & Cups", "Cutlery & Spoons",
        "Coasters & Trivets", "Tableware"
    ],
    "Textiles & Furnishings": [
        "Cushion Covers", "Bedcovers & Quilts", "Table Runners",
        "Rugs & Carpets", "Curtains"
    ],
}


class ProductIntelligenceService:
    """Core intelligence engine orchestrating computer vision, OCR, and attribute analysis."""

    def __init__(
        self,
        vision_client: Optional[Any] = None,
        ocr_service: Optional[OcrService] = None,
    ):
        settings = get_settings()
        self.provider = (settings.VISION_PROVIDER or "gemini").lower()
        if vision_client is not None:
            self.vision_client = vision_client
        elif self.provider == "gemini":
            self.vision_client = GeminiVisionClient()
        else:
            self.vision_client = OllamaVisionClient()

        self.ocr_service = ocr_service or get_ocr_service()

    def predict_category(
        self,
        product_type: str,
        suggested_cat: Optional[str] = None,
        suggested_subcat: Optional[str] = None,
    ) -> CategoryPrediction:
        """
        Map model predictions and product keywords into the standardized catalog taxonomy.
        """
        combined_text = f"{product_type} {suggested_cat or ''} {suggested_subcat or ''}".lower()

        matched_primary = None
        matched_sub = None
        alternatives: List[str] = []

        # Keyword mapping rules: prioritize specific apparel and jewelry categories first
        if any(w in combined_text for w in ["kurta", "saree", "dupatta", "dress", "shirt", "apparel", "wear", "jacket", "ethnic"]):
            matched_primary = "Fashion & Apparel"
            if "kurta" in combined_text or "top" in combined_text:
                matched_sub = "Kurtas & Tops"
            elif "saree" in combined_text:
                matched_sub = "Sarees & Ethnic Wear"
            elif "dupatta" in combined_text:
                matched_sub = "Dupattas & Shawls"
            else:
                matched_sub = suggested_subcat or "Kurtas & Tops"
            alternatives = ["Ethnic Wear", "Textiles"]

        elif any(w in combined_text for w in ["jewelry", "jewellery", "jewel", "earring", "necklace", "bangle", "bracelet", "bag", "clutch", "jhumka"]):
            matched_primary = "Jewelry & Accessories"
            if "earring" in combined_text or "jhumka" in combined_text:
                matched_sub = "Earrings & Jhumkas"
            elif "necklace" in combined_text:
                matched_sub = "Necklaces & Pendants"
            elif "bangle" in combined_text or "bracelet" in combined_text:
                matched_sub = "Bangles & Bracelets"
            elif "bag" in combined_text or "clutch" in combined_text:
                matched_sub = "Handmade Bags & Clutches"
            else:
                matched_sub = suggested_subcat or "Fashion Accessories"
            alternatives = ["Handicrafts", "Accessories"]

        elif any(w in combined_text for w in ["cushion", "bedsheet", "runner", "rug", "curtain", "tapestry"]):
            matched_primary = "Textiles & Furnishings"
            matched_sub = suggested_subcat or "Cushion Covers"
            alternatives = ["Home Decor & Living"]

        elif any(w in combined_text for w in ["box", "vase", "idol", "sculpture", "decor", "candle", "diya", "lamp", "hanging", "wall", "pottery", "statue", "elephant", "figurine", "showpiece", "woodcraft"]):
            matched_primary = "Home Decor & Living"
            if "box" in combined_text:
                matched_sub = "Storage & Boxes"
            elif "hanging" in combined_text or "wall" in combined_text:
                matched_sub = "Wall Art & Hangings"
            elif "vase" in combined_text or "pottery" in combined_text:
                matched_sub = "Vases & Planters"
            elif "idol" in combined_text or "statue" in combined_text:
                matched_sub = "Idols & Sculptures"
            elif "candle" in combined_text or "diya" in combined_text or "lamp" in combined_text:
                matched_sub = "Candle Holders"
            elif any(w in combined_text for w in ["elephant", "figurine", "showpiece", "sculpture", "woodcraft"]):
                matched_sub = "Showpieces & Figurines"
            else:
                matched_sub = suggested_subcat or "Showpieces & Figurines"
            alternatives = ["Handicrafts & Artifacts", "Gift Items"]

        else:
            matched_primary = suggested_cat or "Home Decor & Living"
            matched_sub = suggested_subcat or "Handcrafted Collectibles"
            alternatives = ["Miscellaneous Crafts"]

        confidence = 0.85 if matched_primary in HANDICRAFT_TAXONOMY else 0.65
        uncertainty = (
            UncertaintyStatus.CONFIRMED_OBSERVATION.value
            if confidence >= 0.80
            else UncertaintyStatus.REASONABLE_INFERENCE.value
        )

        return CategoryPrediction(
            primary_category=matched_primary,
            subcategory=matched_sub,
            alternative_categories=alternatives[:2],
            confidence=confidence,
            uncertainty_status=uncertainty,
            reasoning=f"Matched visual characteristics and keywords in product identification: '{product_type}'.",
        )

    def _extract_attributes_list(
        self,
        vision_data: Dict[str, Any],
        ocr_result: OcrResult,
    ) -> List[ExtractedAttribute]:
        """
        Synthesize vision model findings and OCR text into structured ExtractedAttribute models.
        """
        attributes: List[ExtractedAttribute] = []

        is_gemini = (
            getattr(self.vision_client, "provider", "") == "gemini"
            or (self.provider == "gemini" and getattr(self.vision_client, "provider", "") != "ollama")
        )
        vision_source = EvidenceSource.GEMINI_VISION if is_gemini else EvidenceSource.VISION_MODEL

        def add_attr(name: str, value: Any, source: EvidenceSource, notes: Optional[str] = None):
            if not value or str(value).strip().lower() in ("unknown", "none", "n/a", "[]"):
                return
            val_str = ", ".join(value) if isinstance(value, list) else str(value).strip()
            conf, status = evaluate_confidence(name, val_str, source)
            attributes.append(
                ExtractedAttribute(
                    name=name,
                    value=val_str,
                    confidence=conf,
                    evidence_source=source.value,
                    uncertainty_status=status.value,
                    notes=notes,
                )
            )

        # 1. Colors
        add_attr("primary_color", vision_data.get("primary_color"), vision_source)
        add_attr("secondary_colors", vision_data.get("secondary_colors"), vision_source)

        # 2. Material (calibrated as visual appearance)
        add_attr(
            "visible_material",
            vision_data.get("apparent_material"),
            vision_source,
            notes="Based on visible surface texture and finish; exact composition subject to seller verification.",
        )

        # 3. Pattern & Shape
        add_attr("pattern", vision_data.get("pattern"), vision_source)
        add_attr("shape", vision_data.get("shape"), vision_source)

        # 4. Craft details & Decorative Elements
        add_attr("craft_technique", vision_data.get("craft_technique"), vision_source)
        add_attr("decorative_elements", vision_data.get("decorative_elements"), vision_source)

        # 5. Visible Text from OCR (if found)
        if ocr_result.status == "success" and ocr_result.extracted_text:
            conf, status = evaluate_confidence("visible_label_text", ocr_result.extracted_text, EvidenceSource.PADDLE_OCR)
            attributes.append(
                ExtractedAttribute(
                    name="visible_label_text",
                    value=ocr_result.extracted_text,
                    confidence=conf,
                    evidence_source=EvidenceSource.PADDLE_OCR.value,
                    uncertainty_status=status.value,
                    notes="Text directly recognized from packaging, price tag, or brand label.",
                )
            )

        return attributes

    async def analyze_product(
        self,
        image_bytes: bytes,
        filename: str = "product.jpg",
        enable_ocr: bool = True,
        user_hint: Optional[str] = None,
        seller_id: Optional[str] = None,
        store_id: Optional[str] = None,
    ) -> ProductIntelligenceResult:
        """
        Execute end-to-end product intelligence pipeline:
        Cache Lookup → Image validation & Preprocessing → Concurrent (Vision + OCR) → Category & Attribute Synthesis.
        Guarantees tenant isolation and non-blocking worker thread execution.
        """
        start_total = time.perf_counter()

        # 0. Tenant-Safe Cache Lookup
        cache = get_vision_cache()
        active_model = getattr(self.vision_client, "model_name", "gemini-3.8-flash")
        cache_key = cache.generate_key(
            image_bytes=image_bytes,
            enable_ocr=enable_ocr,
            user_hint=user_hint,
            model_name=active_model,
            seller_id=seller_id,
            store_id=store_id,
        )
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            logger.info(f"Serving cached vision result for seller='{seller_id}', store='{store_id}'")
            cached_dict = cached_result.model_dump()
            cached_dict["processing_metadata"]["cache_hit"] = True
            cached_dict["processing_metadata"]["cached"] = True
            cached_dict["processing_metadata"]["total_duration_ms"] = round((time.perf_counter() - start_total) * 1000, 2)
            return ProductIntelligenceResult.model_validate(cached_dict)

        # 1. Validation and Preprocessing
        pil_image, img_meta = validate_image_bytes(image_bytes, filename=filename)
        processed_img, jpeg_bytes, b64_img = preprocess_image(pil_image)

        # 2. Define concurrent coroutines for Vision and OCR
        async def _execute_vision() -> Dict[str, Any]:
            if getattr(self.vision_client, "provider", "") == "gemini":
                return await self.vision_client.analyze_product_image(
                    jpeg_bytes, mime_type="image/jpeg", user_hint=user_hint
                )
            else:
                try:
                    return await self.vision_client.analyze_product_image(b64_img, user_hint=user_hint)
                except TypeError:
                    return await self.vision_client.analyze_product_image(jpeg_bytes, user_hint=user_hint)

        async def _execute_ocr() -> OcrResult:
            return await self.ocr_service.extract_text_from_image(processed_img, enabled=enable_ocr)

        # 3. Parallel Execution: Run Gemini and PaddleOCR concurrently
        start_concurrent = time.perf_counter()
        vision_outcome, ocr_outcome = await asyncio.gather(
            _execute_vision(),
            _execute_ocr(),
            return_exceptions=True,
        )
        concurrent_ms = round((time.perf_counter() - start_concurrent) * 1000, 2)

        # 4. Safely unpack Vision outcome
        if isinstance(vision_outcome, Exception):
            vision_error = str(vision_outcome)
            vision_data = None
            vision_time_ms = concurrent_ms
            logger.warning(f"Vision inference failed concurrently: {vision_error}")
        else:
            vision_error = None
            vision_data = vision_outcome
            vision_time_ms = float(vision_data.get("_duration_ms", concurrent_ms))

        # 5. Safely unpack OCR outcome
        if isinstance(ocr_outcome, Exception):
            ocr_error = str(ocr_outcome)
            ocr_result = OcrResult(
                status="failed",
                extracted_text="",
                segments=[],
                segment_count=0,
                engine="PaddleOCR",
                execution_time_ms=concurrent_ms,
            )
            logger.warning(f"OCR inference failed concurrently: {ocr_error}")
        else:
            ocr_error = None
            ocr_result = ocr_outcome

        # Evaluate Scenarios A, B, C, D
        vision_succeeded = vision_data is not None and isinstance(vision_data, dict)
        ocr_has_text = (
            ocr_result is not None
            and ocr_result.status == "success"
            and bool(ocr_result.extracted_text and ocr_result.extracted_text.strip())
        )

        # Scenario D: Both failed (no vision data and no usable OCR text)
        if not vision_succeeded and not ocr_has_text:
            logger.error(f"Both vision and OCR failed: vision_error={vision_error}, ocr_status={ocr_result.status if ocr_result else 'none'}")
            raise ExternalServiceError(
                message=f"Product analysis failed. Vision provider error: {vision_error or 'Unknown vision failure'}. OCR yielded no text (status={ocr_result.status if ocr_result else 'none'}).",
                details={
                    "vision_error": vision_error,
                    "ocr_status": ocr_result.status if ocr_result else "none",
                    "provider": getattr(self.vision_client, "model_name", "unknown"),
                },
            )

        # Scenario C: Vision failed, OCR succeeded with text
        if not vision_succeeded and ocr_has_text:
            first_line = ocr_result.extracted_text.strip().split("\n")[0][:40]
            product_type = f"Labeled Item: {first_line}"
            visual_description = "Visual model analysis failed. Label and packaging text recognized via PaddleOCR."
            multiple_detected = False
            category_pred = self.predict_category(
                product_type=f"{user_hint or ''} {ocr_result.extracted_text}".strip(),
                suggested_cat=None,
                suggested_subcat=None,
            )
            category_pred.confidence = 0.50
            category_pred.uncertainty_status = UncertaintyStatus.UNCERTAIN.value
            category_pred.reasoning = "Visual model inference failed; catalog categorization inferred solely from recognized label text."

            attributes = self._extract_attributes_list({}, ocr_result)
            uncertainties = [
                f"Visual intelligence failed: {vision_error}. Physical attributes could not be visually confirmed.",
                "All visual, material, and craft attributes require manual seller verification.",
            ]
            total_time_ms = round((time.perf_counter() - start_total) * 1000, 2)

            return ProductIntelligenceResult(
                product_type=product_type,
                visual_description=visual_description,
                multiple_products_detected=multiple_detected,
                category=category_pred,
                attributes=attributes,
                ocr=ocr_result,
                uncertainties=uncertainties,
                image_metadata=img_meta,
                processing_metadata={
                    "total_duration_ms": total_time_ms,
                    "concurrent_execution_ms": concurrent_ms,
                    "vision_duration_ms": vision_time_ms,
                    "ocr_duration_ms": ocr_result.execution_time_ms,
                    "vision_model": getattr(self.vision_client, "model_name", "unknown"),
                    "ocr_status": ocr_result.status,
                    "degraded_mode": "ocr_only",
                    "vision_error": vision_error,
                    "cache_hit": False,
                },
            )

        # Scenarios A & B: Vision succeeded
        product_type = vision_data.get("product_type", "Handcrafted Item")
        category_pred = self.predict_category(
            product_type=product_type,
            suggested_cat=vision_data.get("suggested_primary_category"),
            suggested_subcat=vision_data.get("suggested_subcategory"),
        )

        attributes = self._extract_attributes_list(vision_data, ocr_result)

        multiple_detected = bool(vision_data.get("multiple_products_detected", False))
        uncertainties = list(vision_data.get("uncertainties", []))
        if multiple_detected:
            uncertainties.append(
                "Multiple distinct products appear in the image. Please upload individual product photos for single-item cataloging."
            )

        # Scenario B: OCR failed or was unavailable
        if ocr_result.status == "failed":
            uncertainties.append(
                f"OCR text extraction was unavailable: {ocr_error or 'OCR service failure'}. Visual attributes remain valid."
            )

        total_time_ms = round((time.perf_counter() - start_total) * 1000, 2)

        final_result = ProductIntelligenceResult(
            product_type=product_type,
            visual_description=vision_data.get("visual_description", ""),
            multiple_products_detected=multiple_detected,
            category=category_pred,
            attributes=attributes,
            ocr=ocr_result,
            uncertainties=uncertainties,
            image_metadata=img_meta,
            processing_metadata={
                "total_duration_ms": total_time_ms,
                "concurrent_execution_ms": concurrent_ms,
                "vision_duration_ms": vision_time_ms,
                "ocr_duration_ms": ocr_result.execution_time_ms,
                "vision_model": vision_data.get("_model_used", getattr(self.vision_client, "model_name", "unknown")),
                "fallback_triggered": vision_data.get("_fallback_triggered", False),
                "circuit_breaker_state": vision_data.get("_circuit_breaker_state", "closed"),
                "ocr_status": ocr_result.status,
                "cache_hit": False,
                "cached": False,
            },
        )

        # Store in cache only on successful vision extraction
        cache.set(cache_key, final_result)
        return final_result
