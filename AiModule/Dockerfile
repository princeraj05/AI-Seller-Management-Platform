# Multi-stage lightweight Dockerfile for Bhartiye Crafts AI Microservice
FROM python:3.10-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies if required for network/curl healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create a non-privileged user for security
RUN addgroup --system appgroup && adduser --system --group appuser

# Copy application source code
COPY app/ ./app

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000

# Health check using the lightweight liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Production ASGI server command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
