"""
Centralized Configuration Management using Pydantic Settings.
Environment variables are strictly parsed, validated, and sanitized.
"""
from functools import lru_cache
from pathlib import Path
from typing import Any, List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_AI_MODULE_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_FILE_PATH = _AI_MODULE_DIR / ".env"


class Settings(BaseSettings):
    """Application settings with environment variable fallbacks."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE_PATH,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    # Application Metadata
    APP_NAME: str = Field(default="BhartiyeCrafts-AI-Service", description="Name of the service")
    APP_ENV: str = Field(default="development", description="Environment: development, production, or test")
    DEBUG: bool = Field(default=False, description="Debug mode")
    HOST: str = Field(default="0.0.0.0", description="Host to bind to")
    PORT: int = Field(default=8000, description="Port to bind to")
    API_V1_PREFIX: str = Field(default="/api/v1", description="Prefix for v1 routes")
    LOG_LEVEL: str = Field(default="INFO", description="Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL")

    # Internal Shared Secret for Node.js <-> FastAPI Authentication
    AI_SERVICE_SECRET: str = Field(
        default="dev_internal_ai_service_secret_key_change_in_production_32b",
        description="Shared secret for authenticating requests between Node.js and Python service"
    )

    # Main Node.js Backend Integration
    NODE_BACKEND_URL: str = Field(default="http://localhost:5000", description="Base URL of Node.js backend")
    NODE_BACKEND_TIMEOUT: float = Field(default=15.0, description="Timeout in seconds for Node.js requests")

    # Phase 02 & 02.2: Computer Vision Model Provider Settings
    VISION_PROVIDER: str = Field(default="gemini", description="Primary vision provider: gemini or ollama")
    VISION_MODEL_PROVIDER: Optional[str] = Field(default=None, description="Backward-compatible alias for VISION_PROVIDER")
    VISION_MODEL_NAME: str = Field(default="gemini-3.8-flash", description="Active Vision-Language model name")
    VISION_REQUEST_TIMEOUT: float = Field(default=60.0, description="Vision inference request timeout in seconds")

    # Cloud AI Provider: Google Gemini
    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Google Gemini API key")
    GEMINI_MODEL: str = Field(default="gemini-3.8-flash", description="Default Gemini model name (gemini-3.8-flash)")
    GEMINI_TIMEOUT: float = Field(default=60.0, description="Gemini inference timeout in seconds")

    # Optional Local AI Provider: Ollama (Preserved for GPU environments)
    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", description="Ollama server base URL")
    OLLAMA_MODEL: str = Field(default="qwen2.5-vl:7b", description="Fallback Ollama model name")

    # Phase 02: OCR Engine Settings
    OCR_ENABLED: bool = Field(default=True, description="Enable or disable OCR text extraction")
    OCR_LANGUAGE: str = Field(default="en", description="OCR language code (e.g., en, ch, etc.)")

    # Phase 02.3: Performance & Optimization Settings
    # Gemini Circuit Breaker & Fallback
    GEMINI_PRIMARY_TIMEOUT: float = Field(default=10.0, description="Bounded timeout for primary Gemini model in seconds")
    GEMINI_FALLBACK_MODEL: str = Field(default="gemini-3.5-flash-lite", description="Reliable fast fallback Gemini model")
    GEMINI_CIRCUIT_BREAKER_ENABLED: bool = Field(default=True, description="Enable circuit breaker for Gemini upstream demand spikes")
    GEMINI_CIRCUIT_FAILURE_THRESHOLD: int = Field(default=3, description="Consecutive 503/504 failures before opening circuit")
    GEMINI_CIRCUIT_COOLDOWN_SECONDS: float = Field(default=60.0, description="Cooldown seconds before attempting half-open probe")

    # In-Memory Tenant-Safe Vision Cache
    VISION_CACHE_ENABLED: bool = Field(default=True, description="Enable in-memory LRU/TTL vision results caching")
    VISION_CACHE_TTL_SECONDS: int = Field(default=600, description="Time-to-live for cached vision results in seconds (10 mins)")
    VISION_CACHE_MAX_ENTRIES: int = Field(default=500, description="Maximum entries in LRU vision cache")

    # OCR Concurrency & Worker Settings
    OCR_THREAD_TIMEOUT: float = Field(default=30.0, description="Maximum execution timeout for OCR worker thread in seconds")
    OCR_WARMUP_ON_STARTUP: bool = Field(default=True, description="Whether to pre-warm OCR model weights at startup")

    # Phase 02: Image Processing & Validation Limits
    IMAGE_MAX_SIZE_MB: int = Field(default=10, description="Maximum allowed uploaded image file size in Megabytes")
    IMAGE_MAX_WIDTH: int = Field(default=4096, description="Maximum allowed width in pixels")
    IMAGE_MAX_HEIGHT: int = Field(default=4096, description="Maximum allowed height in pixels")
    IMAGE_MAX_DIMENSION: int = Field(default=1536, description="Target downsampling dimension for model inputs")
    IMAGE_ALLOWED_FORMATS: List[str] = Field(
        default=["JPEG", "JPG", "PNG", "WEBP"],
        description="Allowed image file formats"
    )

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper_v = v.upper().strip()
        if upper_v not in valid_levels:
            raise ValueError(f"Invalid LOG_LEVEL '{v}'. Must be one of {valid_levels}")
        return upper_v

    @field_validator("VISION_PROVIDER")
    @classmethod
    def validate_vision_provider(cls, v: str) -> str:
        valid_providers = {"gemini", "ollama"}
        lower_v = v.lower().strip()
        if lower_v not in valid_providers:
            raise ValueError(f"Invalid VISION_PROVIDER '{v}'. Must be one of {valid_providers}")
        return lower_v

    @field_validator("AI_SERVICE_SECRET")
    @classmethod
    def validate_service_secret(cls, v: str, info) -> str:
        env = info.data.get("APP_ENV", "development")
        if env == "production":
            if not v or v == "dev_internal_ai_service_secret_key_change_in_production_32b":
                raise ValueError("In production, AI_SERVICE_SECRET must be set to a secure, non-default value.")
            if len(v) < 32:
                raise ValueError("In production, AI_SERVICE_SECRET must be at least 32 characters long.")
        return v

    def model_post_init(self, __context: Any) -> None:
        # Backward compatibility: if legacy VISION_MODEL_PROVIDER was explicitly supplied
        if self.VISION_MODEL_PROVIDER and self.VISION_PROVIDER == "gemini" and self.VISION_MODEL_PROVIDER.lower() != "gemini":
            self.VISION_PROVIDER = self.VISION_MODEL_PROVIDER.lower().strip()
        self.VISION_MODEL_PROVIDER = self.VISION_PROVIDER

        # Synchronize active vision model name based on provider
        if self.VISION_PROVIDER == "gemini":
            self.VISION_MODEL_NAME = self.GEMINI_MODEL
        elif self.VISION_PROVIDER == "ollama":
            self.VISION_MODEL_NAME = self.OLLAMA_MODEL

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() == "production"

    @property
    def is_gemini_configured(self) -> bool:
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())

    @property
    def is_ollama_configured(self) -> bool:
        return bool(self.OLLAMA_BASE_URL and self.OLLAMA_BASE_URL.strip())

    def __repr__(self) -> str:
        """Prevent secrets from leaking when settings object is converted to string."""
        return (
            f"<Settings app_name='{self.APP_NAME}' env='{self.APP_ENV}' "
            f"port={self.PORT} node_url='{self.NODE_BACKEND_URL}' "
            f"vision_model='{self.VISION_MODEL_NAME}' ocr_enabled={self.OCR_ENABLED}>"
        )


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
