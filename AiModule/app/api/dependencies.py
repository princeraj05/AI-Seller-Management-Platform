"""
FastAPI Route Dependencies.
Enforces internal service authentication and extracts typed tenant request context.
"""
from typing import Optional
from fastapi import Depends, Header, Request

from app.core.config import Settings, get_settings
from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.security import RequestContext, authenticate_internal_request


def get_request_id(request: Request) -> str:
    """Retrieve unique request ID attached by middleware."""
    return getattr(request.state, "request_id", "req-unknown")


def verify_internal_auth(
    x_internal_service_key: Optional[str] = Header(None, alias="X-Internal-Service-Key"),
    settings: Settings = Depends(get_settings),
) -> bool:
    """
    Dependency that enforces valid internal shared secret header.
    Raises AuthenticationError if header is missing or mismatch.
    """
    authenticate_internal_request(x_internal_service_key, expected_secret=settings.AI_SERVICE_SECRET)
    return True


def get_request_context(
    request: Request,
    is_authenticated: bool = Depends(verify_internal_auth),
    x_seller_id: Optional[str] = Header(None, alias="X-Seller-ID"),
    x_store_id: Optional[str] = Header(None, alias="X-Store-ID"),
    x_user_role: Optional[str] = Header("seller", alias="X-User-Role"),
) -> RequestContext:
    """
    Construct a verified, typed RequestContext.
    Tenant context is only trusted because verify_internal_auth passed first.
    """
    request_id = get_request_id(request)
    return RequestContext(
        seller_id=x_seller_id.strip() if x_seller_id else None,
        store_id=x_store_id.strip() if x_store_id else None,
        user_role=x_user_role.strip() if x_user_role else "seller",
        request_id=request_id,
        is_internal_service=is_authenticated,
    )


def require_seller_context(
    context: RequestContext = Depends(get_request_context)
) -> RequestContext:
    """
    Dependency for routes that strictly require an active seller identity.
    """
    if not context.has_seller_context:
        raise AuthorizationError(
            message="Seller context required. Missing 'X-Seller-ID' header from Node.js backend."
        )
    return context
