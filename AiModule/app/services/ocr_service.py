"""
Optical Character Recognition (OCR) Service using PaddleOCR.
Extracts visible text, labels, and packaging text lazily with confidence calibration.
"""
import time
from typing import Any, List, Optional
import numpy as np
from PIL import Image

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.vision import OcrResult, OcrTextSegment

logger = get_logger("services.ocr_service")


class OcrService:
    """Optical Character Recognition service with lazy-loaded PaddleOCR engine."""

    def __init__(self):
        self._engine = None
        self._initialized = False
        self._is_available = None

    def is_available(self) -> bool:
        """Check if PaddleOCR library is importable without triggering heavy model downloads."""
        if self._is_available is None:
            try:
                import paddleocr  # noqa: F401
                self._is_available = True
            except ImportError:
                self._is_available = False
        return self._is_available

    def _get_engine(self):
        """Lazy initialization of PaddleOCR CPU engine."""
        if self._engine is None:
            if not self.is_available():
                logger.warning("PaddleOCR is not installed in the current environment.")
                return None
            try:
                from paddleocr import PaddleOCR
                settings = get_settings()
                logger.info(f"Initializing PaddleOCR CPU engine (lang='{settings.OCR_LANGUAGE}')...")
                self._engine = PaddleOCR(use_angle_cls=True, lang=settings.OCR_LANGUAGE, show_log=False)
                self._initialized = True
            except Exception as exc:
                logger.error(f"Failed to initialize PaddleOCR engine: {str(exc)}")
                self._engine = None
        return self._engine

    async def extract_text_from_image(self, pil_image: Image.Image, enabled: bool = True) -> OcrResult:
        """
        Extract visible text segments from PIL image.
        Returns structured OcrResult.
        """
        if not enabled:
            return OcrResult(
                status="disabled",
                extracted_text="",
                segments=[],
                segment_count=0,
                engine="PaddleOCR",
                execution_time_ms=0.0,
            )

        start_time = time.perf_counter()

        if not self.is_available():
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return OcrResult(
                status="unavailable",
                extracted_text="",
                segments=[],
                segment_count=0,
                engine="PaddleOCR (Not Installed)",
                execution_time_ms=duration_ms,
            )

        engine = self._get_engine()
        if engine is None:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return OcrResult(
                status="initialization_failed",
                extracted_text="",
                segments=[],
                segment_count=0,
                engine="PaddleOCR",
                execution_time_ms=duration_ms,
            )

        try:
            # Convert PIL Image to RGB NumPy array
            img_np = np.array(pil_image.convert("RGB"))
            results = engine.ocr(img_np, cls=True)

            segments: List[OcrTextSegment] = []
            extracted_lines: List[str] = []

            # PaddleOCR returns [ [ [polygon, (text, confidence)], ... ] ]
            if results and len(results) > 0 and results[0]:
                for line in results[0]:
                    if not line or len(line) < 2:
                        continue
                    bbox, text_tuple = line[0], line[1]
                    text_str, confidence = text_tuple[0], float(text_tuple[1])
                    clean_text = text_str.strip()
                    if clean_text:
                        segments.append(
                            OcrTextSegment(
                                text=clean_text,
                                confidence=round(confidence, 2),
                                bounding_box=bbox,
                            )
                        )
                        extracted_lines.append(clean_text)

            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            if len(segments) == 0:
                return OcrResult(
                    status="no_text_detected",
                    extracted_text="",
                    segments=[],
                    segment_count=0,
                    engine="PaddleOCR",
                    execution_time_ms=duration_ms,
                )

            return OcrResult(
                status="success",
                extracted_text="\n".join(extracted_lines),
                segments=segments,
                segment_count=len(segments),
                engine="PaddleOCR",
                execution_time_ms=duration_ms,
            )

        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(f"OCR inference execution failed: {str(exc)}")
            return OcrResult(
                status="inference_failed",
                extracted_text="",
                segments=[],
                segment_count=0,
                engine="PaddleOCR",
                execution_time_ms=duration_ms,
            )


# Singleton instance
_ocr_service_instance: Optional[OcrService] = None


def get_ocr_service() -> OcrService:
    global _ocr_service_instance
    if _ocr_service_instance is None:
        _ocr_service_instance = OcrService()
    return _ocr_service_instance
