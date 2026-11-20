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

import asyncio
import threading

logger = get_logger("integrations.gemini_vision_client")


class CircuitState:
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class GeminiCircuitBreaker:
    """
    Tracks upstream Gemini service health.
    If consecutive demand spikes (503/504) exceed failure_threshold, the circuit OPENS,
    routing requests directly to the fast fallback model to prevent multi-second delays.
    After cooldown_seconds, enters HALF_OPEN probe state for controlled recovery.
    """

    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 60.0):
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self._lock = threading.Lock()

    def should_bypass_primary(self) -> bool:
        """Check if primary model should be bypassed due to open circuit."""
        with self._lock:
            if self.state == CircuitState.CLOSED:
                return False

            now = time.time()
            if self.state == CircuitState.OPEN:
                if now - self.last_failure_time >= self.cooldown_seconds:
                    logger.info("Gemini circuit breaker cooldown expired; entering HALF_OPEN probe state.")
                    self.state = CircuitState.HALF_OPEN
                    return False  # Allow one probe to test primary
                return True  # Bypass primary

            # HALF_OPEN: allow current probe through
            return False

    def record_success(self):
        """Record successful primary model response and reset circuit."""
        with self._lock:
            if self.state != CircuitState.CLOSED:
                logger.info(f"Primary model probe succeeded; resetting circuit breaker from '{self.state}' to CLOSED.")
            self.state = CircuitState.CLOSED
            self.failure_count = 0

    def record_failure(self, is_upstream_overload: bool = True):
        """Record primary failure and evaluate transition to OPEN."""
        with self._lock:
            if not is_upstream_overload:
                return
            self.failure_count += 1
            self.last_failure_time = time.time()

            if self.state == CircuitState.HALF_OPEN or self.failure_count >= self.failure_threshold:
                if self.state != CircuitState.OPEN:
                    logger.warning(
                        f"Gemini circuit breaker tripped to OPEN (consecutive failures={self.failure_count}, "
                        f"threshold={self.failure_threshold}). Cooldown window: {self.cooldown_seconds}s."
                    )
                self.state = CircuitState.OPEN

    def reset(self):
        """Manually reset circuit breaker for test harnesses."""
        with self._lock:
            self.state = CircuitState.CLOSED
            self.failure_count = 0
            self.last_failure_time = 0.0


# Module-level singleton circuit breaker
_gemini_circuit_breaker: Optional[GeminiCircuitBreaker] = None


def get_gemini_circuit_breaker() -> GeminiCircuitBreaker:
    """Retrieve application-wide circuit breaker instance."""
    global _gemini_circuit_breaker
    if _gemini_circuit_breaker is None:
        settings = get_settings()
        _gemini_circuit_breaker = GeminiCircuitBreaker(
            failure_threshold=settings.GEMINI_CIRCUIT_FAILURE_THRESHOLD,
            cooldown_seconds=settings.GEMINI_CIRCUIT_COOLDOWN_SECONDS,
        )
    return _gemini_circuit_breaker

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
        fallback_model: Optional[str] = None,
        primary_timeout: Optional[float] = None,
    ):
        settings = get_settings()
        self.provider = "gemini"
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model_name = model_name or settings.GEMINI_MODEL
        self.timeout = timeout if timeout is not None else settings.GEMINI_TIMEOUT
        self.fallback_model = fallback_model or settings.GEMINI_FALLBACK_MODEL
        self.primary_timeout = primary_timeout if primary_timeout is not None else settings.GEMINI_PRIMARY_TIMEOUT
        self.circuit_breaker = get_gemini_circuit_breaker()
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

            # Check circuit breaker before attempting primary model
            settings = get_settings()
            should_bypass = (
                settings.GEMINI_CIRCUIT_BREAKER_ENABLED
                and self.circuit_breaker.should_bypass_primary()
                and self.model_name != self.fallback_model
            )

            fallback_triggered = False
            primary_error: Optional[str] = None

            if should_bypass:
                logger.info(
                    f"Gemini circuit breaker is OPEN. Bypassing '{self.model_name}' and "
                    f"directly dispatching to fast fallback model '{self.fallback_model}'."
                )
                model_to_use = self.fallback_model
                fallback_triggered = True
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=model_to_use,
                        contents=[prompt, image_part],
                        config=config,
                    ),
                    timeout=self.timeout,
                )
            else:
                model_to_use = self.model_name
                try:
                    # Bound primary attempt with primary_timeout so demand-spike stalls are caught quickly
                    response = await asyncio.wait_for(
                        client.aio.models.generate_content(
                            model=model_to_use,
                            contents=[prompt, image_part],
                            config=config,
                        ),
                        timeout=self.primary_timeout,
                    )
                    self.circuit_breaker.record_success()
                except Exception as model_exc:
                    err_m = str(model_exc)
                    primary_error = err_m
                    is_overload = (
                        isinstance(model_exc, asyncio.TimeoutError)
                        or "503" in err_m
                        or "UNAVAILABLE" in err_m
                        or "504" in err_m
                        or "DEADLINE_EXCEEDED" in err_m
                    )
                    self.circuit_breaker.record_failure(is_upstream_overload=is_overload)

                    # Maximum 1 fallback attempt
                    if is_overload and model_to_use != self.fallback_model:
                        fallback_triggered = True
                        logger.warning(
                            f"Primary Gemini model '{model_to_use}' failed or timed out ({err_m}). "
                            f"Attempting single fallback to '{self.fallback_model}'..."
                        )
                        model_to_use = self.fallback_model
                        response = await asyncio.wait_for(
                            client.aio.models.generate_content(
                                model=model_to_use,
                                contents=[prompt, image_part],
                                config=config,
                            ),
                            timeout=self.timeout,
                        )
                    else:
                        raise model_exc

        except asyncio.TimeoutError as exc:
            msg = f"Gemini vision inference timed out after {self.timeout}s."
            logger.error(msg)
            raise ExternalServiceError(
                message=msg,
                details={"provider": "gemini", "model": self.model_name, "timeout": self.timeout},
            ) from exc
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
            out_dict["_fallback_triggered"] = fallback_triggered
            out_dict["_circuit_breaker_state"] = self.circuit_breaker.state
            if primary_error:
                out_dict["_primary_error"] = primary_error
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
