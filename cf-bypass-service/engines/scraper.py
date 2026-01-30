"""
Scraper Engine - CloudScraper Implementation
Inherits from BaseBypassEngine for unified interface.
"""
import json
import hashlib
from collections import defaultdict
from dataclasses import asdict
from datetime import datetime
from typing import Dict, Optional, Any, List, Tuple
from urllib.parse import urlparse

import cloudscraper
import redis

from core.engine import BaseBypassEngine, BypassResult
from managers.config_manager import config_manager
from core.utils import EnhancedLogger
from managers.performance_optimizer import PerformanceOptimizer
from managers.session_pool_manager import SessionPoolManager, SessionInfo
from managers.connection_pool_manager import ConnectionPoolManager
from managers.adaptive_retry_manager import AdaptiveRetryManager
from managers.memory_manager import MemoryManager
from managers.health_monitor import EnhancedHealthMonitor
from config import config as phase2_config

# Use EnhancedLogger for sanitized logging (escapes CRLF)
enhanced_logger = EnhancedLogger("scraper-engine")
logger = enhanced_logger.logger

# ─────────────────────────────────────────────────────────────
# Cache Manager
# ─────────────────────────────────────────────────────────────

class CacheManager:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis = None
        self._initialized = False
        # Local memory fallback cache
        self._local_cache: Dict[str, Tuple[BypassResult, float]] = {}
        self._max_local_size = 1000
    
    async def _ensure_connected(self) -> bool:
        """Lazy async initialization of Redis connection"""
        if self._initialized:
            return self.redis is not None
        
        self._initialized = True
        try:
            import redis.asyncio as aioredis
            self.redis = aioredis.from_url(self.redis_url, decode_responses=True)
            await self.redis.ping()
            logger.info("Redis cache connected (async)")
            return True
        except Exception as e:
            logger.warning(f"Redis cache unavailable: {e}")
            self.redis = None
            return False
    
    async def get(self, key: str) -> Optional[BypassResult]:
        """Get from cache (async) with local fallback"""
        if await self._ensure_connected():
            try:
                data = await self.redis.get(key)
                if data:
                    raw = json.loads(data)
                    result = BypassResult(**raw)
                    result.cached = True
                    return result
            except Exception as e:
                logger.warning(f"Redis get error: {e}")
        
        # Local fallback
        if key in self._local_cache:
            result, expiry = self._local_cache[key]
            if time.time() < expiry:
                result.cached = True
                return result
            else:
                del self._local_cache[key]
        return None
    
    async def set(self, key: str, result: BypassResult, ttl: int = 300) -> None:
        """Set cache with TTL (async) with local fallback"""
        # Save to local cache anyway (L1)
        if len(self._local_cache) >= self._max_local_size:
            # Simple eviction: clear 10%
            to_remove = list(self._local_cache.keys())[:100]
            for k in to_remove: del self._local_cache[k]
        self._local_cache[key] = (result, time.time() + ttl)

        # Save to Redis (L2)
        if await self._ensure_connected():
            try:
                raw = asdict(result)
                await self.redis.setex(key, ttl, json.dumps(raw))
            except Exception as e:
                logger.warning(f"Redis set error: {e}")

# ─────────────────────────────────────────────────────────────
# Scraper Engine
# ─────────────────────────────────────────────────────────────

class ScraperEngine(BaseBypassEngine):
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        super().__init__("scraper")
        self.scrapers: Dict[str, cloudscraper.CloudScraper] = {}
        self.cache_manager = CacheManager(redis_url)
        
        if phase2_config.health_monitoring_enabled:
            self.health_monitor = EnhancedHealthMonitor(
                degraded_error_rate_threshold=phase2_config.health_degraded_error_rate,
                slow_response_multiplier=phase2_config.health_slow_response_multiplier,
                baseline_window_size=phase2_config.health_baseline_window_size,
                enable_auto_recovery=phase2_config.health_auto_recovery_enabled
            )
        else:
            self.health_monitor = EnhancedHealthMonitor()
        
        self.performance_optimizer = PerformanceOptimizer(
            enable_parallel=True,
            enable_batch=True,
            max_workers=10,
            batch_size=10
        )
        
        self.session_pool_manager = None
        if phase2_config.session_pool_enabled:
            self.session_pool_manager = SessionPoolManager(
                pool_size=phase2_config.session_pool_size,
                min_threshold=phase2_config.session_pool_min_threshold,
                max_age_hours=phase2_config.session_max_age_hours,
                create_session_func=self._create_scraper
            )
        
        self.connection_pool_manager = None
        if phase2_config.connection_pool_enabled:
            self.connection_pool_manager = ConnectionPoolManager(
                pool_connections=phase2_config.pool_connections,
                pool_maxsize=phase2_config.pool_maxsize,
                max_retries=phase2_config.pool_max_retries,
                backoff_factor=phase2_config.pool_backoff_factor,
                enable_monitoring=True
            )
        
        self.adaptive_retry_manager = None
        if phase2_config.adaptive_retry_enabled:
            self.adaptive_retry_manager = AdaptiveRetryManager(
                high_reliability_max=phase2_config.retry_high_reliability_max,
                medium_reliability_max=phase2_config.retry_medium_reliability_max,
                low_reliability_max=phase2_config.retry_low_reliability_max,
                high_backoff=phase2_config.retry_high_backoff,
                medium_backoff=phase2_config.retry_medium_backoff,
                low_backoff=phase2_config.retry_low_backoff,
                success_rate_high=phase2_config.retry_success_rate_high,
                success_rate_medium=phase2_config.retry_success_rate_medium,
                enable_monitoring=True
            )
        
        self.memory_manager = None
        if phase2_config.memory_optimization_enabled:
            self.memory_manager = MemoryManager(
                streaming_threshold_mb=phase2_config.streaming_threshold_mb,
                idle_session_timeout_hours=phase2_config.idle_session_timeout_hours,
                aggressive_cleanup_threshold=phase2_config.aggressive_cleanup_threshold,
                cache_size_limit=phase2_config.cache_size_limit,
                cleanup_interval_minutes=phase2_config.cleanup_interval_minutes,
                enable_monitoring=True
            )
        
        logger.info("ScraperEngine initialized")
    
    def _get_domain(self, url: str) -> str:
        return urlparse(url).netloc
    
    def _get_domain_config(self, domain: str) -> Dict:
        domain_config = config_manager.get_config(domain)
        return domain_config.to_cloudscraper_config()
    
    def _create_scraper(self, domain: str) -> cloudscraper.CloudScraper:
        config = self._get_domain_config(domain)
        domain_config = config_manager.get_config(domain)
        best_interpreter = self.performance_optimizer.get_best_interpreter(domain)
        
        try:
            config['interpreter'] = best_interpreter
            scraper = cloudscraper.create_scraper(**config)
            
            if self.connection_pool_manager:
                retry_config = None
                if self.adaptive_retry_manager:
                    retry_config = self.adaptive_retry_manager.get_retry_config(domain)
                self.connection_pool_manager.configure_adapter(scraper, domain, retry_config)
            
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
            try:
                return cloudscraper.create_scraper(
                    interpreter=domain_config.interpreter,
                    browser={"browser": "chrome", "platform": "windows"}
                )
            except Exception:
                return cloudscraper.create_scraper()
    
    async def _get_scraper(self, domain: str) -> tuple[cloudscraper.CloudScraper, Optional[SessionInfo]]:
        if self.session_pool_manager:
            session_info = await self.session_pool_manager.get_session(domain)
            if session_info:
                return session_info.session, session_info
        
        if domain not in self.scrapers:
            self.scrapers[domain] = self._create_scraper(domain)
        
        return self.scrapers[domain], None
    
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
        
        cache_key = self.performance_optimizer.generate_cache_key(url, method, {
            'headers': headers,
            'data': body
        })
        
        cached_result = await self.cache_manager.get(cache_key)
        if cached_result:
            return cached_result
        
        scraper, session_info = await self._get_scraper(domain)
        
        if self.memory_manager and session_info:
            self.memory_manager.record_session_use(session_info.session_id)
        
        if self.memory_manager:
            memory_stats = self.memory_manager.check_memory_pressure()
            if memory_stats.is_high_pressure:
                def cleanup_session(session_id):
                    for d, s in list(self.scrapers.items()):
                        if hasattr(s, 'session_id') and s.session_id == session_id:
                            try: s.close()
                            except: pass
                            del self.scrapers[d]
                            break
                self.memory_manager.trigger_aggressive_cleanup(cleanup_session)
        
        try:
            domain_config = config_manager.get_config(domain)
            req_kwargs = {
                'timeout': timeout or domain_config.timeout,
            }
            if headers:
                filtered_headers = {
                    k: v for k, v in headers.items() 
                    if k.lower() not in ['user-agent', 'accept', 'accept-language', 'accept-encoding']
                }
                if filtered_headers: req_kwargs['headers'] = filtered_headers
            
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
            
            self.health_monitor.record_success(domain, duration)
            if self.adaptive_retry_manager:
                self.adaptive_retry_manager.record_attempt(domain, success=True)
            
            if session_info:
                session_info.record_success()
                await self.session_pool_manager.return_session(domain, session_info)
            
            return result
            
        except Exception as e:
            duration = (datetime.now() - start_perf).total_seconds()
            error_msg = str(e)
            self.health_monitor.record_error(domain, error_msg)
            
            if self.adaptive_retry_manager:
                self.adaptive_retry_manager.record_attempt(domain, success=False)
            
            if session_info:
                session_info.record_error()
                if not session_info.is_error_prone():
                    await self.session_pool_manager.return_session(domain, session_info)
            
            return BypassResult(
                status=500,
                html="",
                cf_bypassed=False,
                error=error_msg,
                duration=duration,
                engine=self.name
            )
    
    async def warmup(self, domain: str) -> bool:
        if not self.session_pool_manager:
            return False
        try:
            await self.session_pool_manager.warmup_domain(domain)
            return True
        except Exception:
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        stats = super().get_stats()
        stats.update({
            "active_sessions": len(self.scrapers),
            "health": self.health_monitor.get_stats(),
            "performance": self.performance_optimizer.get_comprehensive_stats()
        })
        if self.session_pool_manager:
            stats["session_pool"] = self.session_pool_manager.get_pool_stats()
        return stats

    async def shutdown(self):
        if self.session_pool_manager:
            await self.session_pool_manager.stop()
        await self.performance_optimizer.shutdown()
        self.scrapers.clear()
        if self.cache_manager.redis:
            await self.cache_manager.redis.close()

# Create the engine instance
engine = ScraperEngine()