"""
Reusable Common Response Schemas.
"""
from typing import Any, Generic, Optional, TypeVar
from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


class BaseResponse(BaseModel, Generic[DataT]):
    """Standardized API success response wrapper."""

    success: bool = Field(default=True, description="Indicates request success")
    message: str = Field(default="Operation completed successfully", description="Human-readable response message")
    data: Optional[DataT] = Field(default=None, description="Response payload")
    request_id: Optional[str] = Field(default=None, description="Request tracking identifier")


class ErrorResponse(BaseModel):
    """Standardized API error response wrapper."""

    success: bool = Field(default=False, description="Always False for error responses")
    message: str = Field(..., description="Error message")
    code: str = Field(default="INTERNAL_SERVER_ERROR", description="Machine-readable error code")
    details: Optional[Any] = Field(default=None, description="Optional detailed error context")
    request_id: Optional[str] = Field(default=None, description="Request tracking identifier")
