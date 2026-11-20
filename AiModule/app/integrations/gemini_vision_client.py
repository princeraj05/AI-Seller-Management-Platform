"""
Google Gemini Multimodal Vision Client.
Provides asynchronous communication with Google Gemini models for structured image understanding.
"""
import json
import re
import time
from typing import Any, Dict, List, Optional, Union

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger
from app.schemas.vision import HandicraftVisionOutput

logger = get_logger("integrations.gemini_vision_client")

HANDICRAFT_GEMINI_PROMPT = """You are an expert Indian handicraft product catalog specialist and computer vision analyst.
Analyze the provided product image and describe its physical, visual, and stylistic characteristics.

STRICT ACCURACY RULES:
1. Describe ONLY what is directly visible in the image. Do not invent materials, brands, or geographical origins.
2. For materials, specify apparent surface texture and finish (e.g. 'Terracotta clay', 'Teak wood', 'Brass metal', 'Cotton weave'). Never claim chemical or certified material purity.
3. Check whether multiple distinct products or staging sets appear in the photo. If yes, set multiple_products_detected to true.
4. If a property cannot be determined from the image, set its value to 'unknown' or document in uncertainties.
5. Return structured data according to the schema.
"""


class GeminiVisionClient:
    """Asynchronous client for interacting with Google Gemini multimodal vision models."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        timeout: Optional[float] = None,
    ):
        settings = get_settings()
        self.provider = "gemini"
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model_name = model_name or settings.GEMINI_MODEL
        self.timeout = timeout if timeout is not None else settings.GEMINI_TIMEOUT
        self._client = None

    def is_configured(self) -> bool:
        """Check if Gemini API key is configured without exposing secrets."""
        return bool(self.api_key and self.api_key.strip())

    def _get_client(self):
        """Lazy initialization of Google GenAI client."""
        if not self.is_configured():
            raise ExternalServiceError(
                message="Google Gemini API key is not configured. Please set GEMINI_API_KEY in environment or .env.",
                details={"provider": "gemini", "model": self.model_name},
            )
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key.strip())
            except Exception as exc:
                logger.error(f"Failed to instantiate Google GenAI client: {str(exc)}")
                raise ExternalServiceError(
                    message=f"Failed to initialize Google GenAI client: {str(exc)}",
                    details={"provider": "gemini"},
                ) from exc
        return self._client

    async def check_availability(self) -> Dict[str, Any]:
        """
        Check Gemini client configuration readiness without performing expensive image inference.
        """
        if not self.is_configured():
            return {
                "configured": False,
                "provider": "gemini",
                "model_configured": self.model_name,
                "reachable": False,
                "error": "GEMINI_API_KEY is not set.",
            }
        return {
            "configured": True,
            "provider": "gemini",
            "model_configured": self.model_name,
            "reachable": True,
            "sdk": "google-genai",
        }

    async def analyze_product_image(
        self,
        image_input: Union[bytes, str],
        mime_type: str = "image/jpeg",
        user_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send image bytes or base64 string to Google Gemini multimodal vision model and return parsed structured analysis.
        """
        if not self.is_configured():
            raise ExternalServiceError(
                message="Google Gemini API key is not configured. Please set GEMINI_API_KEY in environment or .env.",
                details={"provider": "gemini", "model": self.model_name},
            )

        # Handle base64 string or raw bytes
        if isinstance(image_input, str):
            import base64
            try:
                raw_bytes = base64.b64decode(image_input)
            except Exception as exc:
                raise ExternalServiceError(
                    message="Failed to decode base64 image data for Gemini vision inference.",
                    details={"provider": "gemini", "error": str(exc)},
                ) from exc
        else:
            raw_bytes = image_input

        client = self._get_client()

        prompt = HANDICRAFT_GEMINI_PROMPT
        if user_hint and user_hint.strip():
            prompt += f"\nAdditional seller hint for context: {user_hint.strip()}"

        start_time = time.perf_counter()

        try:
            from google.genai import types

            image_part = types.Part.from_bytes(data=raw_bytes, mime_type=mime_type)

            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=HandicraftVisionOutput,
                temperature=0.2,
            )

            # Call async generate_content with primary model, falling back if temporary 503/504 demand spike
            model_to_use = self.model_name
            try:
                response = await client.aio.models.generate_content(
                    model=model_to_use,
                    contents=[prompt, image_part],
                    config=config,
                )
            except Exception as model_exc:
                err_m = str(model_exc)
                if ("503" in err_m or "UNAVAILABLE" in err_m or "504" in err_m or "DEADLINE_EXCEEDED" in err_m) and model_to_use != "gemini-3.5-flash-lite":
                    fallback = "gemini-3.5-flash-lite"
                    logger.warning(
                        f"Primary Gemini model '{model_to_use}' temporarily unavailable due to demand spike ({err_m}). "
                        f"Failing over to compatible multimodal model '{fallback}'..."
                    )
                    model_to_use = fallback
                    response = await client.aio.models.generate_content(
                        model=model_to_use,
                        contents=[prompt, image_part],
                        config=config,
                    )
                else:
                    raise model_exc

        except TimeoutError as exc:
            msg = f"Gemini vision inference timed out after {self.timeout}s."
            logger.error(msg)
            raise ExternalServiceError(
                message=msg,
                details={"provider": "gemini", "model": self.model_name, "timeout": self.timeout},
            ) from exc
        except Exception as exc:
            err_str = str(exc)
            logger.error(f"Gemini API request failed: {err_str}")
            # Identify standard API error scenarios
            if "403" in err_str or "PERMISSION_DENIED" in err_str or "API_KEY_INVALID" in err_str or "unregistered" in err_str.lower():
                raise ExternalServiceError(
                    message="Invalid or unauthorized Google Gemini API key.",
                    details={"provider": "gemini", "model": self.model_name},
                ) from exc
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                raise ExternalServiceError(
                    message="Google Gemini API quota exhausted or rate limit exceeded.",
                    details={"provider": "gemini", "model": self.model_name},
                ) from exc
            if "503" in err_str or "UNAVAILABLE" in err_str:
                raise ExternalServiceError(
                    message="Google Gemini vision service is temporarily unavailable. Please retry later.",
                    details={"provider": "gemini", "model": self.model_name},
                ) from exc

            raise ExternalServiceError(
                message=f"Gemini vision inference failed: {err_str}",
                details={"provider": "gemini", "model": self.model_name},
            ) from exc

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Parse and validate response
        raw_text = getattr(response, "text", "")
        if not raw_text or not raw_text.strip():
            raise ExternalServiceError(
                message="Google Gemini vision model returned empty response content.",
                details={"provider": "gemini", "model": self.model_name},
            )

        try:
            cleaned = self._clean_json(raw_text)
            parsed_data = json.loads(cleaned)
            # Validate through Pydantic
            validated = HandicraftVisionOutput.model_validate(parsed_data)
            out_dict = validated.model_dump()
            out_dict["_duration_ms"] = duration_ms
            out_dict["_model_used"] = model_to_use
            return out_dict
        except Exception as exc:
            logger.error(f"Failed to validate Gemini JSON output: {str(exc)} | Raw: {raw_text[:200]}")
            raise ExternalServiceError(
                message="Google Gemini vision model returned malformed or non-conforming JSON.",
                details={"provider": "gemini", "error": str(exc)},
            ) from exc

    def _clean_json(self, text: str) -> str:
        """Strip markdown code fences and whitespace."""
        cleaned = re.sub(r"^```json\s*", "", text.strip(), flags=re.MULTILINE)
        cleaned = re.sub(r"^```\s*", "", cleaned, flags=re.MULTILINE)
        return cleaned.strip("` \n\r\t")
