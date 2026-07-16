"""Shared cache manager for bypass engines."""

import time
from collections import defaultdict
from typing import Any, Dict, Optional, Tuple

from core.engine import BypassResult


class CacheManager:
    """Local in-memory result cache with TTL, shared across engines."""

    def __init__(self):
        self._local_cache: Dict[str, Tuple[BypassResult, float]] = {}
        self._max_local_size = 1000
        # Lightweight cache metrics
        self._metrics: Dict[str, float] = defaultdict(float)
        # keys:
        # - local_hit / local_miss
        # - get_latency_ms_sum / get_latency_count

    async def get(self, key: str) -> Optional[BypassResult]:
        """Get from local cache (async interface)."""
        t0 = time.time()
        if key in self._local_cache:
            result, expiry = self._local_cache[key]
            if time.time() < expiry:
                result.cached = True
                self._metrics["local_hit"] += 1
                self._metrics["get_latency_ms_sum"] += (time.time() - t0) * 1000
                self._metrics["get_latency_count"] += 1
                return result
            else:
                del self._local_cache[key]
        self._metrics["local_miss"] += 1
        self._metrics["get_latency_ms_sum"] += (time.time() - t0) * 1000
        self._metrics["get_latency_count"] += 1
        return None

    async def set(self, key: str, result: BypassResult, ttl: int = 300) -> None:
        """Set local cache with TTL (async interface)."""
        if len(self._local_cache) >= self._max_local_size:
            # Simple eviction: clear 10%
            to_remove = list(self._local_cache.keys())[:100]
            for k in to_remove:
                del self._local_cache[k]
        self._local_cache[key] = (result, time.time() + ttl)

    def get_stats(self) -> Dict[str, Any]:
        """Return cache statistics."""
        get_count = self._metrics.get("get_latency_count", 0) or 0
        avg_get_latency_ms = (self._metrics.get("get_latency_ms_sum", 0) / get_count) if get_count else 0

        hits = self._metrics.get("local_hit", 0)
        misses = self._metrics.get("local_miss", 0)
        total = hits + misses

        return {
            "local_entries": len(self._local_cache),
            "local_max_entries": self._max_local_size,
            "hit_rate": (hits / total) if total else 0,
            "avg_get_latency_ms": avg_get_latency_ms,
            "counters": dict(self._metrics),
        }
