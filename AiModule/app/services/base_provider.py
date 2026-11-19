"""
Base Model Provider Interface.
Establishes clean abstraction boundaries for future vision, OCR, and LLM providers.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict
from app.core.exceptions import AppException


class ModelProviderError(AppException):
    """Raised when an AI model provider encounters an execution or API error."""

    def __init__(self, provider: str, message: str, details: Any = None):
        super().__init__(
            message=f"[{provider.upper()}] {message}",
            status_code=502,
            code="MODEL_PROVIDER_ERROR",
            details=details,
        )
        self.provider = provider


class BaseModelProvider(ABC):
    """Abstract interface for local or cloud AI model providers."""

    def __init__(self, provider_name: str):
        self.provider_name = provider_name

    @abstractmethod
    async def is_available(self) -> bool:
        """Check whether the provider endpoint is reachable without performing heavy inference."""
        pass

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """Return diagnostic health information for the provider."""
        pass
