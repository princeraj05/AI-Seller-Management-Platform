"""
Ollama Vision-Language Model Integration Client.
Provides asynchronous communication with Ollama for multimodal image understanding.
"""
import json
import re
from typing import Any, Dict, List, Optional
import httpx

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger

logger = get_logger("integrations.ollama_client")

# Structured Handicraft Product Vision Analysis Prompt
HANDICRAFT_VISION_SYSTEM_PROMPT = """You are an expert handicraft product catalog specialist and computer vision analyst.
Analyze the provided product image and describe its physical, visual, and stylistic characteristics.

STRICT ACCURACY RULES:
1. Describe ONLY what is directly visible in the image. Do not invent materials, brands, or origins.
2. For materials, specify apparent texture/finish (e.g. "wood-like surface", "brass-like metallic finish", "cotton-like woven fabric"). Never state 100% material purity.
3. Check whether multiple distinct products appear in the image. If yes, set multiple_products_detected to true.
4. If a property cannot be determined from the image, set its value to "unknown".
5. Return ONLY a valid JSON object matching this exact schema:

{
  "product_type": "Specific product title/type (e.g. Handcrafted Wooden Jewelry Box)",
  "visual_description": "Objective, grounded summary of visible visual features and styling",
  "multiple_products_detected": false,
  "suggested_primary_category": "High level category (e.g. Home Decor, Fashion, Jewelry, Pottery)",
  "suggested_subcategory": "Subcategory (e.g. Storage Box, Kurta, Vase)",
  "primary_color": "Dominant visible color",
  "secondary_colors": ["List of secondary visible colors"],
  "apparent_material": "Apparent surface material/texture",
  "pattern": "Visible pattern (e.g. Floral carving, Jaipuri print, Geometric, Plain)",
  "shape": "Geometric shape (e.g. Rectangular, Cylindrical, Asymmetric)",
  "craft_technique": "Visible artisanal technique (e.g. Hand-carved, Embroidered, Hand-painted, Block-printed, or unknown)",
  "decorative_elements": ["List of decorative features like metallic inlays, tassels, bells"],
  "uncertainties": ["List of attributes that are visually ambiguous or cannot be confirmed"]
}
"""


class OllamaVisionClient:
    """Asynchronous client for interacting with Ollama multimodal vision models."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model_name: Optional[str] = None,
        timeout: Optional[float] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        settings = get_settings()
        self.provider = "ollama"
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.model_name = model_name or settings.VISION_MODEL_NAME
        self.timeout = timeout or settings.VISION_REQUEST_TIMEOUT
        self._client = client

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout),
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        """Close client connection."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def check_availability(self) -> Dict[str, Any]:
        """
        Verify whether the Ollama server is reachable and inspect installed models.
        Does not perform heavy inference.
        """
        client = await self._get_client()
        try:
            response = await client.get("/api/tags", timeout=httpx.Timeout(2.0, connect=2.0))
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name") for m in data.get("models", [])]
                model_found = any(self.model_name in m for m in models)
                return {
                    "reachable": True,
                    "model_configured": self.model_name,
                    "model_found": model_found,
                    "available_models": models,
                }
            return {
                "reachable": True,
                "model_configured": self.model_name,
                "model_found": False,
                "error": f"Ollama returned HTTP {response.status_code}",
            }
        except (httpx.ConnectError, httpx.TimeoutException):
            return {
                "reachable": False,
                "model_configured": self.model_name,
                "model_found": False,
                "error": f"Cannot connect to Ollama server at '{self.base_url}'. Service may be offline.",
            }
        except Exception as exc:
            return {
                "reachable": False,
                "model_configured": self.model_name,
                "model_found": False,
                "error": str(exc),
            }

    async def analyze_product_image(
        self,
        base64_image: str,
        user_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send image to Ollama vision model and return parsed structured analysis.
        """
        client = await self._get_client()
        prompt = HANDICRAFT_VISION_SYSTEM_PROMPT
        if user_hint and user_hint.strip():
            prompt += f"\nAdditional seller hint for context: {user_hint.strip()}"

        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                    "images": [base64_image],
                }
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.2,  # Low temperature for deterministic, factual attributes
            },
        }

        try:
            response = await client.post("/api/chat", json=payload)
        except httpx.TimeoutException as exc:
            msg = f"Ollama vision inference timed out after {self.timeout}s."
            logger.error(msg)
            raise ExternalServiceError(message=msg, details={"model": self.model_name, "timeout": self.timeout}) from exc
        except httpx.ConnectError as exc:
            msg = f"Cannot connect to Ollama vision service at '{self.base_url}'. Ensure Ollama is running."
            logger.error(msg)
            raise ExternalServiceError(message=msg, details={"base_url": self.base_url, "model": self.model_name}) from exc
        except httpx.RequestError as exc:
            msg = f"Network error during Ollama vision inference: {str(exc)}"
            logger.error(msg)
            raise ExternalServiceError(message=msg) from exc

        if response.status_code == 404:
            msg = f"Vision model '{self.model_name}' was not found on Ollama. Please run 'ollama pull {self.model_name}'."
            logger.error(msg)
            raise ExternalServiceError(message=msg, details={"status_code": 404, "model": self.model_name})

        if response.status_code >= 400:
            msg = f"Ollama vision service returned HTTP error {response.status_code}"
            logger.error(f"{msg}: {response.text}")
            raise ExternalServiceError(message=msg, details={"status_code": response.status_code, "body": response.text[:200]})

        # Parse model response
        try:
            res_json = response.json()
            raw_content = res_json.get("message", {}).get("content", "")
            return self._parse_json_content(raw_content)
        except Exception as exc:
            logger.error(f"Failed to parse Ollama model output: {str(exc)}")
            raise ExternalServiceError(
                message="Ollama vision model returned malformed output.",
                details={"error": str(exc)},
            ) from exc

    def _parse_json_content(self, text: str) -> Dict[str, Any]:
        """Strip markdown fences and parse clean JSON."""
        cleaned = re.sub(r"^```json\s*", "", text.strip(), flags=re.MULTILINE)
        cleaned = re.sub(r"^```\s*", "", cleaned, flags=re.MULTILINE)
        cleaned = cleaned.strip("` \n\r\t")
        return json.loads(cleaned)
