"""
Main FastAPI Application Entrypoint for Bhartiye Crafts AI Microservice.
Configures lifespan, middleware, routers, exception handlers, and observability.
"""
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import router as api_v1_router
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import get_logger, setup_logging
from app.integrations.node_client import get_node_client
from app.schemas.health import HealthResponse, ReadinessResponse

settings = get_settings()
setup_logging(settings.LOG_LEVEL)
logger = get_logger("app.main")

# Record startup timestamp
START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context manager handling startup and shutdown events."""
    active_settings = get_settings()
    logger.info(
        f"Starting {active_settings.APP_NAME} in '{active_settings.APP_ENV}' mode on port {active_settings.PORT}"
    )
    yield
    logger.info(f"Shutting down {active_settings.APP_NAME}...")
    node_client = get_node_client()
    await node_client.close()
    logger.info("Application shutdown complete.")


def create_application() -> FastAPI:
    """Application factory initializing FastAPI with all middleware and routes."""
    app = FastAPI(
        title="Bhartiye Crafts AI Microservice",
        description="High-performance AI/ML microservice for multimodal cataloging, vision intelligence, and seller operations.",
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # 1. CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5000"] if not settings.is_production else [],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # 2. Request ID & Execution Time Logging Middleware
    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:12]}"
        request.state.request_id = req_id

        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        response.headers["X-Request-ID"] = req_id
        response.headers["X-Response-Time-MS"] = str(duration_ms)

        logger.info(
            f"{request.method} {request.url.path} responded {response.status_code} in {duration_ms}ms",
            extra={
                "request_id": req_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response

    # 3. Register Standardized Exception Handlers
    register_exception_handlers(app)

    # 4. Liveness Probe Endpoint (GET /health)
    @app.get("/health", response_model=HealthResponse, tags=["Health"])
    async def health_check(active_settings: Settings = Depends(get_settings)) -> HealthResponse:
        """Lightweight process liveness probe."""
        uptime = round(time.time() - START_TIME, 2)
        return HealthResponse(
            status="ok",
            version="1.0.0",
            service=active_settings.APP_NAME,
            environment=active_settings.APP_ENV,
            timestamp=datetime.now(timezone.utc).isoformat(),
            uptime_seconds=uptime,
        )

    # 5. Readiness Probe Endpoint (GET /health/ready)
    @app.get("/health/ready", response_model=ReadinessResponse, tags=["Health"])
    async def readiness_check(active_settings: Settings = Depends(get_settings)) -> ReadinessResponse:
        """Application readiness probe validating mandatory configurations."""
        checks = {
            "configuration": "valid",
            "node_backend_target": "configured" if active_settings.NODE_BACKEND_URL else "missing",
            "internal_secret": "configured" if active_settings.AI_SERVICE_SECRET else "missing",
        }
        is_ready = all(status != "missing" for status in checks.values())

        if not is_ready:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "not_ready",
                    "service": active_settings.APP_NAME,
                    "environment": active_settings.APP_ENV,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "checks": checks,
                },
            )

        return ReadinessResponse(
            status="ready",
            service=active_settings.APP_NAME,
            environment=active_settings.APP_ENV,
            timestamp=datetime.now(timezone.utc).isoformat(),
            checks=checks,
        )

    # 6. Mount Versioned API Router
    app.include_router(api_v1_router)

    return app


app = create_application()
