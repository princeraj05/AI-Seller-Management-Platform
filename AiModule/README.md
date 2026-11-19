# Bhartiye Crafts — Python AI/ML Microservice

Welcome to the independent AI/ML microservice for the **Bhartiye Crafts AI Seller Management Platform**.

This service is responsible for providing computer vision, OCR, multimodal catalog generation, RAG-powered knowledge retrieval, and conversational seller intelligence.

---

## 1. Technology Stack

* **Language**: Python 3.10+
* **Framework**: FastAPI (high-performance asynchronous ASGI web framework)
* **Server**: Uvicorn with standard ASGI workers
* **Validation & Settings**: Pydantic v2 & Pydantic-Settings
* **HTTP Client**: HTTPX (asynchronous client for Node.js backend integration)
* **Testing**: Pytest & Pytest-Asyncio
* **Containerization**: Docker (multi-stage non-root runtime)

---

## 2. Directory Architecture

```text
AiModule/
├── app/
│   ├── __init__.py
│   ├── main.py                     # Centralized application entrypoint & lifespan
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py               # Pydantic Settings & environment validation
│   │   ├── logging.py              # Structured contextual logging with sanitization
│   │   ├── security.py             # Internal secret verification & RequestContext
│   │   └── exceptions.py           # Standardized AppException hierarchy & handlers
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── dependencies.py         # Route dependencies (auth, tenant context)
│   │   └── v1/
│   │       ├── __init__.py
│   │       └── router.py           # API v1 router and verification endpoints
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── common.py               # BaseResponse, ErrorResponse
│   │   └── health.py               # HealthResponse, ReadinessResponse
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   └── base_provider.py        # Abstract model provider interface
│   │
│   ├── integrations/
│   │   ├── __init__.py
│   │   └── node_client.py          # Resilient Async Node.js Backend Client
│   │
│   ├── models/
│   │   └── __init__.py
│   │
│   └── utils/
│       └── __init__.py
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py                 # Pytest fixtures & TestClient configuration
│   ├── test_health.py              # Liveness and readiness probe tests
│   ├── test_config.py              # Configuration validation & security tests
│   ├── test_security.py            # Authentication & tenant context tests
│   └── test_node_client.py         # Node.js backend integration tests
│
├── requirements.txt                # Pinned production dependencies
├── Dockerfile                      # Non-root multi-stage container build
├── .dockerignore                   # Docker build exclusions
├── .env.example                    # Environment variable template
├── .gitignore                      # Python and secret exclusions
└── README.md                       # Microservice documentation
```

---

## 3. Environment Setup & Installation

### Prerequisites
* Python 3.10 or higher
* Node.js backend running on `http://localhost:5000` (for end-to-end integration)

### Local Virtual Environment
```bash
# Navigate to AiModule directory
cd AiModule

# Create isolated virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 4. Environment Configuration

Copy the example environment file and configure settings:
```bash
cp .env.example .env
```

Key environment variables:
| Variable | Default | Description |
| :--- | :--- | :--- |
| `APP_NAME` | `BhartiyeCrafts-AI-Service` | Service name |
| `APP_ENV` | `development` | `development`, `production`, or `test` |
| `DEBUG` | `true` | Enables Swagger UI at `/docs` |
| `HOST` | `0.0.0.0` | Bind host address |
| `PORT` | `8000` | Port for the FastAPI server |
| `API_V1_PREFIX` | `/api/v1` | URL prefix for version 1 endpoints |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `AI_SERVICE_SECRET` | *(32+ char key)* | Internal shared secret for Node.js <-> FastAPI communication |
| `NODE_BACKEND_URL` | `http://localhost:5000` | Main Node.js business backend base URL |
| `NODE_BACKEND_TIMEOUT` | `15.0` | Node.js HTTP request timeout in seconds |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL (future Phase 02) |
| `GEMINI_API_KEY` | *(optional)* | Google Gemini API key (optional fallback) |

---

## 5. Running the Service

### Development Server
```bash
# Run with live auto-reload on port 8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive documentation is available at:
* **Swagger UI**: `http://localhost:8000/docs`
* **ReDoc**: `http://localhost:8000/redoc`

---

## 6. Docker Deployment

### Build Docker Image
```bash
docker build -t bhartiyecrafts-ai-service:latest -f Dockerfile .
```

### Run Docker Container
```bash
docker run -d \
  -p 8000:8000 \
  -e AI_SERVICE_SECRET="production_secure_secret_key_32_chars_min!" \
  -e APP_ENV="production" \
  --name bhartiyecrafts-ai \
  bhartiyecrafts-ai-service:latest
```

---

## 7. Health & Verification Endpoints

### 1. Liveness Probe
```http
GET /health
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "service": "BhartiyeCrafts-AI-Service",
  "environment": "development",
  "timestamp": "2026-11-19T16:00:00.000000+00:00",
  "uptime_seconds": 12.45
}
```

### 2. Readiness Probe
```http
GET /health/ready
```
**Response (200 OK):**
```json
{
  "status": "ready",
  "service": "BhartiyeCrafts-AI-Service",
  "environment": "development",
  "timestamp": "2026-11-19T16:00:00.000000+00:00",
  "checks": {
    "configuration": "valid",
    "node_backend_target": "configured",
    "internal_secret": "configured"
  }
}
```

---

## 8. Internal Service Authentication Contract

All internal endpoints (`/api/v1/*`) require service-to-service authentication.

### Required Headers
| Header | Requirement | Description |
| :--- | :--- | :--- |
| `X-Internal-Service-Key` | **Required** | Constant-time verified shared secret matching `AI_SERVICE_SECRET`. |
| `X-Seller-ID` | **Context** | Authenticated tenant seller ID forwarded from Node.js auth middleware. |
| `X-Store-ID` | **Optional** | Store ID forwarded from Node.js tenant middleware. |
| `X-User-Role` | **Optional** | Role (`seller` or `admin`). |

### Authentication Verification Route
```http
GET /api/v1/verify-auth
Headers:
  X-Internal-Service-Key: <AI_SERVICE_SECRET>
  X-Seller-ID: 64b8a1c2e4f0a2b4c6d8e0f2
```

---

## 9. Running Automated Tests

```bash
# Run pytest from inside AiModule
python -m pytest -v
```

The test suite covers:
* Application startup & ASGI lifespan
* Liveness (`/health`) and readiness (`/health/ready`) probes
* Pydantic configuration validation & production security checks
* Internal service authentication & tenant context extraction
* Node.js HTTP client requests, mock transport, timeouts, and error handling

---

## 10. Planned Future Modules

* **Phase 02**: Vision, OCR & Product Intelligence Engine (Qwen3-VL / Ollama, PaddleOCR, attribute extraction)
* **Phase 03**: Multi-Channel Listing & Schema Generator (Amazon SP-API, Flipkart, Meesho)
* **Phase 04**: RAG Knowledge Engine (MongoDB Atlas Vector Search, Sentence Transformers)
* **Phase 05**: Conversational AI Seller Assistant with Tool Calling
* **Phase 06**: Business Intelligence, Trend Analysis & Automated Reports
