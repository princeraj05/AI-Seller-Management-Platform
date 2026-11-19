"""
Security and Internal Service Authentication Foundation.
Enforces constant-time shared secret verification and tenant context resolution.
"""
import secrets
from typing import Optional
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError


class RequestContext(BaseModel):
    """Typed request context representing the authenticated caller and tenant."""

    seller_id: Optional[str] = Field(default=None, description="Authenticated tenant seller ID from Node.js")
    store_id: Optional[str] = Field(default=None, description="Optional store ID associated with seller")
    user_role: Optional[str] = Field(default="seller", description="Role of the authenticated seller/admin")
    request_id: str = Field(..., description="Unique request tracing identifier")
    is_internal_service: bool = Field(default=False, description="Whether request passed internal service authentication")

    @property
    def has_seller_context(self) -> bool:
        """Verify whether an active seller context is attached."""
        return bool(self.seller_id and self.seller_id.strip())


def verify_internal_secret(provided_key: Optional[str], expected_secret: Optional[str] = None) -> bool:
    """
    Verify internal shared secret using constant-time string comparison.
    Never leaks string length or differences through timing side-channels.
    """
    if not provided_key or not provided_key.strip():
        return False

    if expected_secret is None:
        settings = get_settings()
        expected_secret = settings.AI_SERVICE_SECRET

    if not expected_secret:
        return False

    return secrets.compare_digest(provided_key.strip(), expected_secret.strip())


def authenticate_internal_request(provided_key: Optional[str], expected_secret: Optional[str] = None) -> None:
    """
    Raise AuthenticationError if internal service key is missing or invalid.
    """
    if not verify_internal_secret(provided_key, expected_secret):
        raise AuthenticationError(
            message="Unauthorized. Missing or invalid internal service key (X-Internal-Service-Key)."
        )
