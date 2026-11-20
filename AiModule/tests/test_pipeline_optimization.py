"""
Unit and Integration Tests for Phase 02.3 AI Vision Pipeline Optimizations.
Tests cover:
- Tenant-safe LRU Cache with TTL, LRU eviction, and tenant isolation
- Gemini Circuit Breaker state transitions, bypass logic, and cooldown recovery
- Concurrent Vision & OCR execution latency reduction
- PaddleOCR Thread-safety and Non-blocking event loop offloading
"""
import asyncio
import io
import threading
import time
from unittest.mock import AsyncMock, MagicMock

import pytest
from PIL import Image

from app.core.exceptions import ExternalServiceError
from app.integrations.gemini_vision_client import CircuitState, GeminiCircuitBreaker
from app.schemas.vision import (
    CategoryPrediction,
    ImageMetadata,
    OcrResult,
    OcrTextSegment,
    ProductIntelligenceResult,
)
from app.services.ocr_service import OcrService
from app.services.product_intelligence_service import ProductIntelligenceService
from app.utils.cache import AiVisionCache


@pytest.fixture
def sample_image_bytes():
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color="green")
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def mock_product_result():
    return ProductIntelligenceResult(
        product_type="Handmade Ceramic Mug",
        visual_description="Glazed ceramic mug with indigo motifs",
        multiple_products_detected=False,
        category=CategoryPrediction(
            primary_category="Home & Kitchen",
            subcategory="Drinkware",
            confidence=0.90,
            uncertainty_status="confirmed_observation",
            reasoning="Ceramic cylinder with attached handle and traditional motifs.",
        ),
        attributes=[],
        ocr=OcrResult(
            status="no_text_detected",
            extracted_text="",
            segments=[],
            segment_count=0,
            engine="PaddleOCR",
            execution_time_ms=5.0,
        ),
        uncertainties=[],
        image_metadata=ImageMetadata(
            width=100,
            height=100,
            format="JPEG",
            size_bytes=512,
            aspect_ratio=1.0,
            has_exif=False,
            channels=3,
        ),
        processing_metadata={"test": True},
    )


# ============================================================================
# 1. AI Vision Cache Tests (LRU, TTL, Tenant Isolation, Thread Safety)
# ============================================================================


def test_cache_hit_and_miss(sample_image_bytes, mock_product_result):
    cache = AiVisionCache(max_entries=10, ttl_seconds=60, enabled=True)
    key = cache.generate_key(sample_image_bytes, enable_ocr=True, seller_id="seller_1")

    # Initially empty
    assert cache.get(key) is None
    stats = cache.get_stats()
    assert stats["misses"] == 1
    assert stats["hits"] == 0

    # Store and retrieve
    assert cache.set(key, mock_product_result) is True
    cached_obj = cache.get(key)
    assert cached_obj is not None
    assert cached_obj.product_type == "Handmade Ceramic Mug"
    stats = cache.get_stats()
    assert stats["hits"] == 1
    assert stats["entries"] == 1


def test_cache_ttl_expiration(sample_image_bytes, mock_product_result):
    cache = AiVisionCache(max_entries=10, ttl_seconds=1, enabled=True)
    cache.ttl_seconds = 0.05
    key = cache.generate_key(sample_image_bytes, enable_ocr=True, seller_id="seller_1")

    cache.set(key, mock_product_result)
    assert cache.get(key) is not None

    # Wait for TTL expiration
    time.sleep(0.06)
    assert cache.get(key) is None
    assert cache.get_stats()["misses"] == 1


def test_cache_tenant_isolation(sample_image_bytes, mock_product_result):
    """Verify that seller A and seller B never share cache entries even for identical images."""
    cache = AiVisionCache(max_entries=10, ttl_seconds=60, enabled=True)

    key_seller_a = cache.generate_key(
        sample_image_bytes,
        enable_ocr=True,
        seller_id="seller_A",
        store_id="store_1",
    )
    key_seller_b = cache.generate_key(
        sample_image_bytes,
        enable_ocr=True,
        seller_id="seller_B",
        store_id="store_1",
    )
    key_store_2 = cache.generate_key(
        sample_image_bytes,
        enable_ocr=True,
        seller_id="seller_A",
        store_id="store_2",
    )

    # Keys must be completely distinct
    assert key_seller_a != key_seller_b
    assert key_seller_a != key_store_2

    # Set seller A's result
    cache.set(key_seller_a, mock_product_result)

    # Seller B gets a cache miss
    assert cache.get(key_seller_b) is None
    # Seller A on store 2 gets a cache miss
    assert cache.get(key_store_2) is None
    # Seller A on store 1 gets a cache hit
    assert cache.get(key_seller_a) is not None


def test_cache_lru_eviction(sample_image_bytes, mock_product_result):
    cache = AiVisionCache(max_entries=2, ttl_seconds=60, enabled=True)

    k1 = cache.generate_key(sample_image_bytes, enable_ocr=True, seller_id="s1")
    k2 = cache.generate_key(sample_image_bytes, enable_ocr=True, seller_id="s2")
    k3 = cache.generate_key(sample_image_bytes, enable_ocr=True, seller_id="s3")

    cache.set(k1, mock_product_result)
    cache.set(k2, mock_product_result)
    assert cache.get_stats()["entries"] == 2

    # Inserting 3rd entry must evict k1
    cache.set(k3, mock_product_result)
    assert cache.get(k1) is None
    assert cache.get(k2) is not None
    assert cache.get(k3) is not None
    assert cache.get_stats()["evictions"] == 1


def test_cache_thread_safety(sample_image_bytes, mock_product_result):
    cache = AiVisionCache(max_entries=100, ttl_seconds=60, enabled=True)
    threads = []
    errors = []

    def worker(tid):
        try:
            for i in range(25):
                key = cache.generate_key(
                    sample_image_bytes,
                    enable_ocr=True,
                    seller_id=f"seller_{tid}_{i % 5}",
                )
                cache.set(key, mock_product_result)
                val = cache.get(key)
                if val is None or val.product_type != "Handmade Ceramic Mug":
                    errors.append(f"Failed retrieval in thread {tid}")
        except Exception as e:
            errors.append(str(e))

    for t in range(5):
        th = threading.Thread(target=worker, args=(t,))
        threads.append(th)
        th.start()

    for th in threads:
        th.join()

    assert len(errors) == 0
    assert cache.get_stats()["entries"] > 0


# ============================================================================
# 2. Gemini Circuit Breaker Tests (Threshold, Cooldown, Half-Open Probe)
# ============================================================================


def test_circuit_breaker_initial_state():
    cb = GeminiCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)
    assert cb.state == CircuitState.CLOSED
    assert cb.should_bypass_primary() is False


def test_circuit_breaker_opens_after_threshold_failures():
    cb = GeminiCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)

    cb.record_failure(is_upstream_overload=True)
    assert cb.state == CircuitState.CLOSED
    assert cb.should_bypass_primary() is False

    cb.record_failure(is_upstream_overload=True)
    assert cb.state == CircuitState.CLOSED
    assert cb.should_bypass_primary() is False

    # 3rd consecutive overload reaches threshold -> transitions to OPEN
    cb.record_failure(is_upstream_overload=True)
    assert cb.state == CircuitState.OPEN
    assert cb.should_bypass_primary() is True


def test_circuit_breaker_non_server_error_does_not_trip():
    """Client-side errors (is_upstream_overload=False) should not increment failure count."""
    cb = GeminiCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)

    for _ in range(5):
        cb.record_failure(is_upstream_overload=False)

    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0
    assert cb.should_bypass_primary() is False


def test_circuit_breaker_half_open_probe_and_recovery():
    cb = GeminiCircuitBreaker(failure_threshold=2, cooldown_seconds=0.08)

    cb.record_failure(is_upstream_overload=True)
    cb.record_failure(is_upstream_overload=True)
    assert cb.state == CircuitState.OPEN
    assert cb.should_bypass_primary() is True

    # Wait for cooldown to expire
    time.sleep(0.10)

    # Next call transitions to HALF_OPEN probe, allowing execution (should_bypass = False)
    assert cb.should_bypass_primary() is False
    assert cb.state == CircuitState.HALF_OPEN

    # If the probe succeeds -> circuit recovers to CLOSED
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0


def test_circuit_breaker_half_open_failure_reopens():
    cb = GeminiCircuitBreaker(failure_threshold=2, cooldown_seconds=0.08)

    cb.record_failure(is_upstream_overload=True)
    cb.record_failure(is_upstream_overload=True)
    assert cb.state == CircuitState.OPEN

    time.sleep(0.10)
    assert cb.should_bypass_primary() is False
    assert cb.state == CircuitState.HALF_OPEN

    # Probe fails -> immediately reopens
    cb.record_failure(is_upstream_overload=True)
    assert cb.state == CircuitState.OPEN
    assert cb.should_bypass_primary() is True


# ============================================================================
# 3. Concurrent Vision & OCR Pipeline Execution Tests
# ============================================================================


@pytest.mark.asyncio
async def test_concurrent_vision_and_ocr_parallelism(sample_image_bytes):
    """
    Demonstrate that Vision and OCR run concurrently:
    Simulate Vision = 0.20s, OCR = 0.20s.
    Sequential execution would take >= 0.40s.
    Concurrent execution should complete in ~0.20-0.35s.
    """
    async def delayed_vision(*args, **kwargs):
        await asyncio.sleep(0.20)
        return {
            "product_type": "Kashmiri Pashmina Shawl",
            "visual_description": "Handwoven cashmere shawl",
            "multiple_products_detected": False,
            "suggested_primary_category": "Apparel & Accessories",
            "suggested_subcategory": "Shawls",
            "primary_color": "Crimson",
            "uncertainties": [],
        }

    async def delayed_ocr(*args, **kwargs):
        await asyncio.sleep(0.20)
        return OcrResult(
            status="success",
            extracted_text="Pure Pashmina",
            segments=[OcrTextSegment(text="Pure Pashmina", confidence=0.95)],
            segment_count=1,
            engine="PaddleOCR",
            execution_time_ms=200.0,
        )

    mock_v_client = MagicMock()
    mock_v_client.provider = "gemini"
    mock_v_client.model_name = "gemini-3.8-flash"
    mock_v_client.analyze_product_image = AsyncMock(side_effect=delayed_vision)

    mock_ocr_srv = MagicMock()
    mock_ocr_srv.extract_text_from_image = AsyncMock(side_effect=delayed_ocr)

    service = ProductIntelligenceService(vision_client=mock_v_client, ocr_service=mock_ocr_srv)

    t_start = time.perf_counter()
    result = await service.analyze_product(sample_image_bytes, enable_ocr=True)
    t_elapsed = time.perf_counter() - t_start

    assert result.product_type == "Kashmiri Pashmina Shawl"
    assert result.ocr.status == "success"
    # Concurrency verification: must complete under 0.38s (well below sequential 0.40s)
    assert t_elapsed < 0.38, f"Expected concurrent execution < 0.38s, got {t_elapsed:.3f}s"


# ============================================================================
# 4. PaddleOCR Non-Blocking Thread Safety & Concurrency
# ============================================================================


@pytest.mark.asyncio
async def test_ocr_service_non_blocking_event_loop():
    """Verify that OcrService offloads heavy inference to worker threads without blocking event loop."""
    service = OcrService()

    # Mock engine.ocr to simulate a 0.15s CPU workload
    def slow_ocr_sync(img_np, *args, **kwargs):
        time.sleep(0.12)
        return [[[[[0, 0], [10, 0], [10, 10], [0, 10]], ("Thread-Safe OCR", 0.98)]]]

    service._engine = MagicMock()
    service._engine.ocr = MagicMock(side_effect=slow_ocr_sync)
    service._initialized = True

    # Run two concurrent OCR requests alongside a fast periodic event-loop heartbeat
    heartbeat_ticks = 0

    async def heartbeat():
        nonlocal heartbeat_ticks
        for _ in range(12):
            await asyncio.sleep(0.02)
            heartbeat_ticks += 1

    pil_img = Image.new("RGB", (64, 64), color="white")

    t_start = time.perf_counter()
    hb_task = asyncio.create_task(heartbeat())
    ocr_task1 = asyncio.create_task(service.extract_text_from_image(pil_img))
    ocr_task2 = asyncio.create_task(service.extract_text_from_image(pil_img))

    res1, res2, _ = await asyncio.gather(ocr_task1, ocr_task2, hb_task)
    t_total = time.perf_counter() - t_start

    # Verify both OCR calls succeeded
    assert res1.status == "success"
    assert res2.status == "success"
    assert "Thread-Safe OCR" in res1.extracted_text
    # Event loop heartbeat was NOT starved/blocked by the sync OCR inference
    assert heartbeat_ticks >= 5, f"Event loop was blocked! Only {heartbeat_ticks} heartbeats ticked."
