"""
Computer Vision and Product Intelligence API Routes.
"""
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.dependencies import get_request_context, require_seller_context, verify_internal_auth
from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.core.security import RequestContext
from app.integrations.gemini_vision_client import GeminiVisionClient
from app.integrations.ollama_client import OllamaVisionClient
from app.schemas.common import BaseResponse
from app.schemas.vision import ProductIntelligenceResult
from app.services.ocr_service import get_ocr_service
from app.services.product_intelligence_service import ProductIntelligenceService

router = APIRouter(prefix="/vision", tags=["Vision & Product Intelligence"])


@router.post("/extract-attributes", response_model=BaseResponse[ProductIntelligenceResult])
async def extract_product_attributes(
    file: UploadFile = File(..., description="Uploaded product image (JPEG, PNG, WEBP)"),
    enable_ocr: bool = Form(default=True, description="Whether to execute OCR text extraction on the image"),
    user_hint: Optional[str] = Form(default=None, description="Optional seller description or hint for context"),
    context: RequestContext = Depends(require_seller_context),
) -> BaseResponse[ProductIntelligenceResult]:
    """
    Primary Product Intelligence Endpoint:
    Accepts an uploaded handicraft product photo, validates dimensions and format,
    executes vision-language analysis, optional OCR text recognition, and returns structured attributes.
    """
    filename = file.filename or "uploaded_image.jpg"
    try:
        image_bytes = await file.read()
    except Exception as exc:
        raise ValidationError(message="Failed to read uploaded image stream.", details={"error": str(exc)})

    if not image_bytes or len(image_bytes) == 0:
        raise ValidationError(message="Uploaded file is empty.", details={"filename": filename})

    intelligence_service = ProductIntelligenceService()
    result = await intelligence_service.analyze_product(
        image_bytes=image_bytes,
        filename=filename,
        enable_ocr=enable_ocr,
        user_hint=user_hint,
    )

    return BaseResponse[ProductIntelligenceResult](
        success=True,
        message="Product image analyzed successfully",
        data=result,
        request_id=context.request_id,
    )


@router.get("/status", response_model=BaseResponse[dict])
async def get_vision_engine_status(
    context: RequestContext = Depends(get_request_context),
) -> BaseResponse[dict]:
    """
    Secondary Vision Status Endpoint:
    Reports the operational availability of the vision model provider and OCR engine
    without initializing heavy model weights.
    """
    settings = get_settings()
    provider = settings.VISION_PROVIDER.lower()

    gemini_client = GeminiVisionClient()
    gemini_diag = await gemini_client.check_availability()

    if provider == "gemini":
        active_status = gemini_diag
        vision_ready = bool(gemini_diag.get("configured", False))
        ollama_diag = {
            "reachable": False,
            "provider": "ollama",
            "model_configured": settings.OLLAMA_MODEL,
            "model_found": False,
            "note": "Ollama network check skipped; active provider is Gemini.",
        }
    else:
        ollama_client = OllamaVisionClient()
        ollama_diag = await ollama_client.check_availability()
        active_status = ollama_diag
        vision_ready = bool(ollama_diag.get("reachable", False) and ollama_diag.get("model_found", False))

    ocr_service = get_ocr_service()
    ocr_available = ocr_service.is_available()

    return BaseResponse[dict](
        success=True,
        message="Vision and OCR engine diagnostic status",
        data={
            "vision_provider": provider,
            "vision_model_configured": settings.VISION_MODEL_NAME,
            "gemini_status": gemini_diag,
            "ollama_status": ollama_diag,
            "active_provider_status": active_status,
            "vision_ready": vision_ready,
            "ocr_enabled": settings.OCR_ENABLED,
            "ocr_engine": "PaddleOCR",
            "ocr_library_installed": ocr_available,
            "ready": vision_ready and ocr_available,
        },
        request_id=context.request_id,
    )
