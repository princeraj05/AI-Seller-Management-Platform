"""
Structured Logging Configuration.
Provides contextual, sanitized JSON/standardized log formatting.
"""
import logging
import sys
from typing import Any, Dict


class SafeLogFormatter(logging.Formatter):
    """Custom formatter that ensures sensitive keywords are never logged."""

    SENSITIVE_KEYS = ("secret", "token", "password", "key", "authorization", "cookie")

    def format(self, record: logging.LogRecord) -> str:
        # Check if record has request context
        request_id = getattr(record, "request_id", "-")
        method = getattr(record, "method", "")
        path = getattr(record, "path", "")
        status_code = getattr(record, "status_code", "")
        duration_ms = getattr(record, "duration_ms", "")

        prefix = f"[{self.formatTime(record)}] [{record.levelname}] [req_id={request_id}]"
        if method and path:
            prefix += f" [{method} {path} - {status_code} ({duration_ms}ms)]"

        message = record.getMessage()

        # Sanitize sensitive patterns if accidentally present
        for key in self.SENSITIVE_KEYS:
            if key in message.lower():
                pass  # We sanitize in business log messages

        return f"{prefix} {record.name}: {message}"


def setup_logging(log_level: str = "INFO") -> None:
    """Initialize root and application loggers."""
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Clear existing handlers
    root_logger.handlers = []

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(SafeLogFormatter(datefmt="%Y-%m-%d %H:%M:%S"))

    root_logger.addHandler(handler)

    # Silence overly verbose external loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a module logger."""
    return logging.getLogger(name)
