"""
Curl Impersonate Engine - TLS fingerprint-based HTTP client
Uses curl_cffi to mimic real browser TLS fingerprints, bypassing CF edge detection.
No browser, no JS challenge solving — pure transport-level impersonation.
"""
import json
import asyncio
import time
from collections import defaultdict
from datetime import datetime
from typing import Dict, Optional, Any, Tuple
from urllib.parse import urlparse

from curl_cffi.requests import AsyncSession, BrowserType

from core.engine import BaseBypassEngine, BypassResult
from core.utils import EnhancedLogger

enhanced_logger = EnhancedLogger("curl-impersonate")
logger = enhanced_logger.logger


class CacheManager:
    def __init__(self):
        self._local_cache: Dict[str, Tuple[BypassResult, float]] = {}
        self._max_local_size = 1000
        self._metrics: Dict[str, float] = defaultdict(float)

    async def get(self, key: str) -> Optional[BypassResult]:
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
        if len(self._local_cache) >= self._max_local_size:
            to_remove = list(self._local_cache.keys())[:100]
            for k in to_remove:
                del self._local_cache[k]
        self._local_cache[key] = (result, time.time() + ttl)

    def get_stats(self) -> Dict[str, Any]:
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


class CurlImpersonateEngine(BaseBypassEngine):
    def __init__(self, impersonate: str = "chrome142"):
        super().__init__("curl_impersonate")
        self._impersonate = impersonate
        self._session: Optional[AsyncSession] = None
        self._session_lock = asyncio.Lock()
        self.cache_manager = CacheManager()
        self._metrics = defaultdict(float)
        logger.info(f"CurlImpersonateEngine initialized (impersonate={impersonate})")

    @staticmethod
    def _get_domain(url: str) -> str:
        return urlparse(url).netloc

    async def _get_session(self) -> AsyncSession:
        if self._session is None:
            async with self._session_lock:
                if self._session is None:
                    self._session = AsyncSession(impersonate=self._impersonate)
        return self._session

    def _decode_content(self, response) -> str:
        content_type = response.headers.get("content-type", "").lower()
        if "gbk" in content_type or "gb2312" in content_type:
            return response.content.decode("gbk", errors="replace")
        try:
            return response.text
        except Exception:
            return response.content.decode("utf-8", errors="replace")

    async def fetch(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        body: Optional[str] = None,
        timeout: int = 30,
        proxy: Optional[str] = None,
        **kwargs,
    ) -> BypassResult:
        domain = self._get_domain(url)
        start_perf = datetime.now()

        allow_cache = method.upper() == "GET" and not body
        cache_key = json.dumps(
            {"url": url, "method": method.upper(), "headers": headers or {}},
            sort_keys=True,
        )

        if allow_cache:
            cached_result = await self.cache_manager.get(cache_key)
            if cached_result:
                return cached_result

        try:
            session = await self._get_session()

            req_kwargs = {"timeout": timeout}
            if headers:
                req_kwargs["headers"] = headers
            if body:
                req_kwargs["data"] = body
            if proxy:
                req_kwargs["proxy"] = proxy

            response = await session.request(method, url, **req_kwargs)
            duration = (datetime.now() - start_perf).total_seconds()

            html = self._decode_content(response)

            cf_bypassed = True
            if response.status_code in [403, 503]:
                if any(
                    indicator in html.lower()
                    for indicator in [
                        "just a moment",
                        "challenge-platform",
                        "checking your browser",
                        "cloudflare",
                        "ddos protection",
                        "security check",
                    ]
                ):
                    cf_bypassed = False

            result = BypassResult(
                status=response.status_code,
                html=html,
                cookies=dict(response.cookies),
                headers=dict(response.headers),
                cf_bypassed=cf_bypassed,
                duration=duration,
                engine=self.name,
            )

            if response.status_code == 200 and allow_cache:
                await self.cache_manager.set(cache_key, result, ttl=120)
            self._metrics["success"] += 1
            self._metrics["duration_ms_sum"] += duration * 1000
            self._metrics["duration_count"] += 1
            return result

        except Exception as e:
            duration = (datetime.now() - start_perf).total_seconds()
            self._metrics["error_other"] += 1
            return BypassResult(
                status=500,
                html="",
                cf_bypassed=False,
                error=str(e),
                duration=duration,
                engine=self.name,
            )

    async def warmup(self, domain: str) -> bool:
        return True

    def get_stats(self) -> Dict[str, Any]:
        stats = super().get_stats()
        duration_count = self._metrics.get("duration_count", 0) or 0
        avg_duration_ms = (self._metrics.get("duration_ms_sum", 0) / duration_count) if duration_count else 0
        stats.update(
            {
                "impersonate": self._impersonate,
                "avg_duration_ms": avg_duration_ms,
                "counters": dict(self._metrics),
                "cache": self.cache_manager.get_stats(),
            }
        )
        return stats

    async def shutdown(self):
        if self._session:
            await self._session.close()
            self._session = None