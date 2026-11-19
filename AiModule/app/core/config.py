"""
Centralized Configuration Management using Pydantic Settings.
Environment variables are strictly parsed, validated, and sanitized.
"""
from functools import lru_cache
from typing import Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable fallbacks."""

    model_config = SettingsConfigDict(
        env_file=".env",
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

    # Future AI Model Provider Settings (Optional for Phase 01)
    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", description="Ollama server base URL")
    OLLAMA_MODEL: str = Field(default="qwen2.5-vl:7b", description="Default Vision-Language model name")
    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Optional Google Gemini API key")
    GEMINI_MODEL: str = Field(default="gemini-1.5-flash", description="Default Gemini model name")

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper_v = v.upper().strip()
        if upper_v not in valid_levels:
            raise ValueError(f"Invalid LOG_LEVEL '{v}'. Must be one of {valid_levels}")
        return upper_v

    @field_validator("AI_SERVICE_SECRET")
    @classmethod
    def validate_service_secret(cls, v: str, info) -> str:
        # In production, enforce minimum 32 chars and disallow the default dev secret
        env = info.data.get("APP_ENV", "development")
        if env == "production":
            if not v or v == "dev_internal_ai_service_secret_key_change_in_production_32b":
                raise ValueError("In production, AI_SERVICE_SECRET must be set to a secure, non-default value.")
            if len(v) < 32:
                raise ValueError("In production, AI_SERVICE_SECRET must be at least 32 characters long.")
        return v

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
            f"gemini_configured={self.is_gemini_configured}>"
        )


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
