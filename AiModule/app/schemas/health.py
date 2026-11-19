"""
Health and Readiness Response Schemas.
"""
from typing import Dict
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness probe response model."""

    status: str = Field(default="ok", description="Process liveness status")
    version: str = Field(..., description="Service version")
    service: str = Field(..., description="Service name")
    environment: str = Field(..., description="Runtime environment")
    timestamp: str = Field(..., description="ISO 8601 current timestamp")
    uptime_seconds: float = Field(..., description="Uptime duration in seconds")


class ReadinessResponse(BaseModel):
    """Readiness probe response model."""

    status: str = Field(default="ready", description="Application readiness status: ready or not_ready")
    service: str = Field(..., description="Service name")
    environment: str = Field(..., description="Runtime environment")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    checks: Dict[str, str] = Field(default_factory=dict, description="Status of core configuration checks")
