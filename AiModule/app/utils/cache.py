"""
In-Memory Tenant-Safe LRU Cache with TTL Expiration.
Caches validated ProductIntelligenceResult objects to eliminate duplicate inference latency.
Strictly enforces tenant isolation (seller_id, store_id) and never caches errors or failures.
"""
from collections import OrderedDict
import hashlib
import threading
import time
from typing import Any, Dict, Optional

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.vision import ProductIntelligenceResult

logger = get_logger("utils.cache")

SCHEMA_VERSION = "2.3.0"


class AiVisionCache:
    """
    Thread-safe, bounded LRU cache with TTL expiration for AI vision results.
    Guarantees strict tenant isolation by binding keys to seller_id and store_id.
    """

    def __init__(
        self,
        max_entries: Optional[int] = None,
        ttl_seconds: Optional[int] = None,
        enabled: Optional[bool] = None,
    ):
        settings = get_settings()
        self.max_entries = max_entries or settings.VISION_CACHE_MAX_ENTRIES
        self.ttl_seconds = ttl_seconds if ttl_seconds is not None else settings.VISION_CACHE_TTL_SECONDS
        self.enabled = enabled if enabled is not None else settings.VISION_CACHE_ENABLED

        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._lock = threading.Lock()

        # Observability stats
        self._hits = 0
        self._misses = 0
        self._evictions = 0

    def generate_key(
        self,
        image_bytes: bytes,
        enable_ocr: bool,
        user_hint: Optional[str] = None,
        model_name: Optional[str] = None,
        seller_id: Optional[str] = None,
        store_id: Optional[str] = None,
        schema_version: str = SCHEMA_VERSION,
    ) -> str:
        """
        Generate deterministic, tenant-isolated cache key.
        Incorporates seller_id, store_id, content SHA-256, OCR mode, normalized hint, model, and schema.
        """
        img_sha256 = hashlib.sha256(image_bytes).hexdigest()
        tenant = f"{seller_id or 'anon'}:{store_id or 'default'}"
        norm_hint = (user_hint or "").strip().lower()
        active_model = model_name or "default"

        key_raw = f"{tenant}|{img_sha256}|ocr={enable_ocr}|hint={norm_hint}|m={active_model}|v={schema_version}"
        return hashlib.sha256(key_raw.encode("utf-8")).hexdigest()

    def get(self, key: str) -> Optional[ProductIntelligenceResult]:
        """
        Retrieve cached result if present and unexpired.
        Returns None on miss or expired TTL.
        """
        if not self.enabled:
            return None

        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None

            entry = self._cache[key]
            now = time.time()

            # Check TTL
            if now - entry["timestamp"] > self.ttl_seconds:
                # Expired
                del self._cache[key]
                self._misses += 1
                return None

            # Hit: move to most recently used
            self._cache.move_to_end(key)
            self._hits += 1
            logger.debug(f"Cache HIT for key {key[:12]}...")

            # Return reconstructed Pydantic model
            try:
                data_dict = entry["data"]
                return ProductIntelligenceResult.model_validate(data_dict)
            except Exception as exc:
                logger.warning(f"Failed to deserialize cached entry {key[:12]}: {exc}")
                del self._cache[key]
                return None

    def set(
        self,
        key: str,
        result: ProductIntelligenceResult,
    ) -> bool:
        """
        Store a successful, validated result in cache.
        Rejects failed or unvalidated objects.
        """
        if not self.enabled:
            return False

        # Guard: Never cache failed results or degenerate states
        if not result or not getattr(result, "product_type", None):
            return False

        data_dict = result.model_dump()

        with self._lock:
            now = time.time()
            if key in self._cache:
                self._cache.move_to_end(key)
            else:
                # Enforce max entries via LRU eviction
                if len(self._cache) >= self.max_entries:
                    self._cache.popitem(last=False)
                    self._evictions += 1

            self._cache[key] = {
                "timestamp": now,
                "data": data_dict,
            }
            logger.debug(f"Cache SET for key {key[:12]}... (Total cached: {len(self._cache)})")
            return True

    def clear(self) -> None:
        """Flush all cache entries."""
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0
            self._evictions = 0

    def get_stats(self) -> Dict[str, Any]:
        """Return cache health and usage diagnostics."""
        with self._lock:
            total = self._hits + self._misses
            hit_rate = round(self._hits / total, 3) if total > 0 else 0.0
            return {
                "enabled": self.enabled,
                "entries": len(self._cache),
                "max_entries": self.max_entries,
                "ttl_seconds": self.ttl_seconds,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": hit_rate,
                "evictions": self._evictions,
            }


# Singleton cache instance
_vision_cache_instance: Optional[AiVisionCache] = None


def get_vision_cache() -> AiVisionCache:
    """Retrieve application-wide vision cache singleton."""
    global _vision_cache_instance
    if _vision_cache_instance is None:
        _vision_cache_instance = AiVisionCache()
    return _vision_cache_instance
