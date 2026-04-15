"""
Scraper Engine - CloudScraper Implementation
Inherits from BaseBypassEngine for unified interface.
"""
import json
import time
from collections import defaultdict
from datetime import datetime
from typing import Dict, Optional, Any, List, Tuple
from urllib.parse import urlparse

import cloudscraper

from core.engine import BaseBypassEngine, BypassResult
from core.utils import EnhancedLogger
from core.errors import BypassError, ErrorCode, error_handler

# Use EnhancedLogger for sanitized logging (escapes CRLF)
enhanced_logger = EnhancedLogger("scraper-engine")
logger = enhanced_logger.logger

# ─────────────────────────────────────────────────────────────
# Cache Manager
# ─────────────────────────────────────────────────────────────

class CacheManager:
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
            for k in to_remove: del self._local_cache[k]
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

# ─────────────────────────────────────────────────────────────
# Scraper Engine
# ─────────────────────────────────────────────────────────────

class ScraperEngine(BaseBypassEngine):
    def __init__(self):
        super().__init__("scraper")
        self.scrapers: Dict[str, cloudscraper.CloudScraper] = {}
        self.cache_manager = CacheManager()
        self._metrics = defaultdict(float)
        logger.info("ScraperEngine initialized")
    
    def _get_domain(self, url: str) -> str:
        return urlparse(url).netloc
    
    def _create_scraper(self, domain: str) -> cloudscraper.CloudScraper:
        try:
            scraper = cloudscraper.create_scraper()
            scraper.headers.update({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            })
            return scraper
            
        except Exception as e:
            logger.error(f"Failed to create scraper for {domain}: {e}")
            return cloudscraper.create_scraper()
    
    async def _get_scraper(self, domain: str) -> cloudscraper.CloudScraper:
        if domain not in self.scrapers:
            self.scrapers[domain] = self._create_scraper(domain)
        return self.scrapers[domain]
    
    @error_handler
    async def fetch(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        body: Optional[str] = None,
        timeout: int = 30,
        proxy: Optional[str] = None,
        **kwargs
    ) -> BypassResult:
        domain = self._get_domain(url)
        start_time_dt = datetime.now()
        start_perf = datetime.now()

        cache_key = json.dumps(
            {"url": url, "method": method, "headers": headers or {}, "body": body or ""},
            sort_keys=True,
        )
        
        cached_result = await self.cache_manager.get(cache_key)
        if cached_result:
            return cached_result

        scraper = await self._get_scraper(domain)
        
        try:
            req_kwargs = {
                'timeout': timeout,
            }
            if headers:
                # Preserve caller-provided headers (especially User-Agent/Cookie),
                # as some bypass cookies (e.g. cf_clearance) are UA-bound.
                req_kwargs['headers'] = headers
            
            if body: req_kwargs['data'] = body
            if proxy: req_kwargs['proxies'] = {'http': proxy, 'https': proxy}
            
            response = scraper.request(method, url, **req_kwargs)
            duration = (datetime.now() - start_perf).total_seconds()
            
            cf_bypassed = True
            if response.status_code in [403, 503]:
                if any(indicator in response.text.lower() for indicator in [
                    'just a moment', 'challenge-platform', 'checking your browser',
                    'cloudflare', 'ddos protection', 'security check'
                ]):
                    cf_bypassed = False
            
            html = response.text
            if not html and response.content:
                try:
                    content_type = response.headers.get('content-type', '').lower()
                    if 'gbk' in content_type or 'gb2312' in content_type:
                        html = response.content.decode('gbk', errors='replace')
                    else:
                        html = response.content.decode('utf-8', errors='replace')
                except Exception:
                    html = response.content.decode('utf-8', errors='replace')
            
            result = BypassResult(
                status=response.status_code,
                html=html,
                cookies=dict(response.cookies),
                headers=dict(response.headers),
                cf_bypassed=cf_bypassed,
                duration=duration,
                engine=self.name
            )
            
            if response.status_code == 200:
                await self.cache_manager.set(cache_key, result, ttl=900)
            self._metrics["success"] += 1
            self._metrics["duration_ms_sum"] += duration * 1000
            self._metrics["duration_count"] += 1
            return result
            
        except cloudscraper.exceptions.CloudflareChallengeError as e:
            duration = (datetime.now() - start_perf).total_seconds()
            bypass_error = BypassError.from_cloudscraper_error(e, url)
            self._metrics["error_cf_challenge"] += 1

            return BypassResult(
                status=403,
                html="",
                cf_bypassed=False,
                error=bypass_error.message,
                duration=duration,
                engine=self.name
            )

        except Exception as e:
            duration = (datetime.now() - start_perf).total_seconds()

            # Convert to BypassError if not already one
            if isinstance(e, BypassError):
                bypass_error = e
            else:
                bypass_error = BypassError(
                    ErrorCode.INTERNAL_ERROR,
                    f"Request failed: {str(e)}",
                    context={"url": url, "domain": domain}
                )

            self._metrics["error_other"] += 1

            return BypassResult(
                status=500,
                html="",
                cf_bypassed=False,
                error=bypass_error.message,
                duration=duration,
                engine=self.name
            )
    
    async def warmup(self, domain: str) -> bool:
        return True
    
    def get_stats(self) -> Dict[str, Any]:
        stats = super().get_stats()
        duration_count = self._metrics.get("duration_count", 0) or 0
        avg_duration_ms = (self._metrics.get("duration_ms_sum", 0) / duration_count) if duration_count else 0
        stats.update({
            "active_sessions": len(self.scrapers),
            "avg_duration_ms": avg_duration_ms,
            "counters": dict(self._metrics),
            "cache": self.cache_manager.get_stats(),
        })
        return stats

    async def shutdown(self):
        for _, s in list(self.scrapers.items()):
            try:
                s.close()
            except Exception:
                pass
        self.scrapers.clear()

 