"""
Standardized Application Exceptions and Handlers.
"""
from typing import Any, Optional
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger("exceptions")


class AppException(Exception):
    """Base application exception with HTTP status code and error code."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        code: str = "INTERNAL_SERVER_ERROR",
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details


class AuthenticationError(AppException):
    """Raised when internal or client authentication fails."""

    def __init__(self, message: str = "Invalid or missing internal service credentials.", details: Optional[Any] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTHENTICATION_FAILED",
            details=details,
        )


class AuthorizationError(AppException):
    """Raised when role or tenant permission is insufficient."""

    def __init__(self, message: str = "Forbidden. Insufficient permissions.", details: Optional[Any] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            code="FORBIDDEN",
            details=details,
        )


class ResourceNotFoundError(AppException):
    """Raised when a requested resource does not exist."""

    def __init__(self, message: str = "Resource not found.", details: Optional[Any] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            code="NOT_FOUND",
            details=details,
        )


class ValidationError(AppException):
    """Raised when request payload or parameter fails domain validation."""

    def __init__(self, message: str = "Validation failed.", details: Optional[Any] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="VALIDATION_ERROR",
            details=details,
        )


class ExternalServiceError(AppException):
    """Raised when communication with an external upstream service (Node.js/Ollama/Gemini) fails."""

    def __init__(self, message: str = "External service communication failure.", details: Optional[Any] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_502_BAD_GATEWAY,
            code="EXTERNAL_SERVICE_ERROR",
            details=details,
        )


def register_exception_handlers(app: FastAPI) -> None:
    """Register custom exception handlers with FastAPI application."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        request_id = getattr(request.state, "request_id", None)
        logger.warning(
            f"AppException: {exc.code} - {exc.message}",
            extra={"request_id": request_id, "status_code": exc.status_code}
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": exc.message,
                "code": exc.code,
                "details": exc.details,
                "request_id": request_id,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", None)
        errors = exc.errors()
        # Clean pydantic error dicts for safe client response
        cleaned_errors = [
            {"loc": err.get("loc"), "msg": err.get("msg"), "type": err.get("type")}
            for err in errors
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "message": "Input validation error",
                "code": "VALIDATION_ERROR",
                "details": cleaned_errors,
                "request_id": request_id,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": exc.detail,
                "code": "HTTP_ERROR",
                "details": None,
                "request_id": request_id,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        logger.error(
            f"Unhandled exception: {str(exc)}",
            exc_info=True,
            extra={"request_id": request_id}
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "message": "An unexpected internal server error occurred.",
                "code": "INTERNAL_SERVER_ERROR",
                "details": None,
                "request_id": request_id,
            },
        )
