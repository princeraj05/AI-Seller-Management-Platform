"""
API v1 Central Router.
Mounts modular sub-routers for future AI capabilities and provides foundation endpoints.
"""
from fastapi import APIRouter, Depends

from app.api.dependencies import get_request_context, require_seller_context
from app.core.security import RequestContext
from app.schemas.common import BaseResponse

router = APIRouter(prefix="/api/v1", tags=["API v1"])


@router.get("/verify-auth", response_model=BaseResponse[dict])
async def verify_auth_status(
    context: RequestContext = Depends(get_request_context),
) -> BaseResponse[dict]:
    """
    Internal service authentication test endpoint.
    Verifies that the caller possesses valid service secret and reports extracted tenant context.
    """
    return BaseResponse[dict](
        success=True,
        message="Internal service authentication verified",
        data={
            "is_internal_service": context.is_internal_service,
            "seller_id": context.seller_id,
            "store_id": context.store_id,
            "user_role": context.user_role,
        },
        request_id=context.request_id,
    )


@router.get("/verify-seller-context", response_model=BaseResponse[dict])
async def verify_seller_context(
    context: RequestContext = Depends(require_seller_context),
) -> BaseResponse[dict]:
    """
    Seller-scoped endpoint verification.
    Guarantees both valid internal service secret and a non-empty X-Seller-ID header.
    """
    return BaseResponse[dict](
        success=True,
        message="Seller context verified",
        data={
            "seller_id": context.seller_id,
            "store_id": context.store_id,
            "user_role": context.user_role,
        },
        request_id=context.request_id,
    )

# Note: Future sub-routers for Vision, Listings, RAG, Assistant, and Analytics
# will be registered here as:
# router.include_router(vision_router, prefix="/vision", tags=["Vision"])
# router.include_router(listings_router, prefix="/listings", tags=["Listings"])
# router.include_router(assistant_router, prefix="/assistant", tags=["Assistant"])
# router.include_router(rag_router, prefix="/rag", tags=["RAG"])
# router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
