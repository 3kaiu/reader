"""
CloudScraper Wrapper - Maximizing Built-in Features
Utilizes 100% of CloudScraper's free built-in anti-detection capabilities.
Only implements features that CloudScraper lacks: caching, monitoring, session health.
"""
import json
import hashlib
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, Optional
from urllib.parse import urlparse

import cloudscraper
import redis

from config_manager import config_manager
from core.utils import EnhancedLogger
from performance_optimizer import PerformanceOptimizer
from session_pool_manager import SessionPoolManager, SessionInfo
from connection_pool_manager import ConnectionPoolManager
from adaptive_retry_manager import AdaptiveRetryManager
from memory_manager import MemoryManager
from health_monitor import EnhancedHealthMonitor
from phase2_config import phase2_config

# Use EnhancedLogger for sanitized logging (escapes CRLF)
enhanced_logger = EnhancedLogger("cloudscraper-wrapper")
logger = enhanced_logger.logger

# ─────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────

@dataclass
class FetchResult:
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    error: Optional[str] = None
    cached: bool = False
    duration: float = 0.0
    
    def to_json(self) -> str:
        """Serialize for caching"""
        return json.dumps(asdict(self))
    
    @classmethod
    def from_json(cls, data: str) -> 'FetchResult':
        """Deserialize from cache"""
        return cls(**json.loads(data))

# ─────────────────────────────────────────────────────────────
# Cache Manager - CloudScraper doesn't have caching
# Uses redis.asyncio for non-blocking async operations
# ─────────────────────────────────────────────────────────────

class CacheManager:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis = None
        self._initialized = False
    
    async def _ensure_connected(self) -> bool:
        """Lazy async initialization of Redis connection"""
        if self._initialized:
            return self.redis is not None
        
        self._initialized = True
        try:
            # Use redis.asyncio for true async support
            import redis.asyncio as aioredis
            self.redis = aioredis.from_url(self.redis_url, decode_responses=True)
            # Test connection
            await self.redis.ping()
            logger.info("Redis cache connected (async)")
            return True
        except Exception as e:
            logger.warning(f"Redis cache unavailable: {e}")
            self.redis = None
            return False
    
    async def get(self, key: str) -> Optional[FetchResult]:
        """Get from cache (async)"""
        if not await self._ensure_connected():
            return None
        try:
            data = await self.redis.get(key)
            if data:
                result = FetchResult.from_json(data)
                result.cached = True
                return result
        except Exception as e:
            logger.warning(f"Cache get error: {e}")
        return None
    
    async def set(self, key: str, result: FetchResult, ttl: int = 300) -> None:
        """Set cache with TTL (async)"""
        if not await self._ensure_connected():
            return
        try:
            await self.redis.setex(key, ttl, result.to_json())
        except Exception as e:
            logger.warning(f"Cache set error: {e}")

# ─────────────────────────────────────────────────────────────
# CloudScraper Wrapper - Maximizing Built-in Features
# ─────────────────────────────────────────────────────────────

class CloudScraperWrapper:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        # CloudScraper instances per domain (CloudScraper handles session management)
        self.scrapers: Dict[str, cloudscraper.CloudScraper] = {}
        
        # Only add what CloudScraper doesn't have
        self.cache_manager = CacheManager(redis_url)
        
        # Use EnhancedHealthMonitor for Phase 2 (if enabled) or fallback
        if phase2_config.health_monitoring_enabled:
            self.health_monitor = EnhancedHealthMonitor(
                degraded_error_rate_threshold=phase2_config.health_degraded_error_rate,
                slow_response_multiplier=phase2_config.health_slow_response_multiplier,
                baseline_window_size=phase2_config.health_baseline_window_size,
                enable_auto_recovery=phase2_config.health_auto_recovery_enabled
            )
            logger.info(
                f"Enhanced health monitor initialized "
                f"(degraded_threshold={phase2_config.health_degraded_error_rate}, "
                f"slow_multiplier={phase2_config.health_slow_response_multiplier}x)"
            )
        else:
            self.health_monitor = EnhancedHealthMonitor()
            logger.info("Basic health monitor initialized (EnhancedHealthMonitor in standard mode)")
        
        # Performance optimizer for Phase 1 optimizations
        self.performance_optimizer = PerformanceOptimizer(
            enable_parallel=True,
            enable_batch=True,
            max_workers=10,
            batch_size=10
        )
        
        # Session pool manager for Phase 2 optimizations (if enabled)
        self.session_pool_manager = None
        if phase2_config.session_pool_enabled:
            self.session_pool_manager = SessionPoolManager(
                pool_size=phase2_config.session_pool_size,
                min_threshold=phase2_config.session_pool_min_threshold,
                max_age_hours=phase2_config.session_max_age_hours,
                create_session_func=self._create_scraper
            )
            logger.info(f"Session pool manager initialized (size={phase2_config.session_pool_size})")
        
        # Connection pool manager for Phase 2 optimizations (if enabled)
        self.connection_pool_manager = None
        if phase2_config.connection_pool_enabled:
            self.connection_pool_manager = ConnectionPoolManager(
                pool_connections=phase2_config.pool_connections,
                pool_maxsize=phase2_config.pool_maxsize,
                max_retries=phase2_config.pool_max_retries,
                backoff_factor=phase2_config.pool_backoff_factor,
                enable_monitoring=True
            )
            logger.info(
                f"Connection pool manager initialized "
                f"(connections={phase2_config.pool_connections}, "
                f"maxsize={phase2_config.pool_maxsize})"
            )
        
        # Adaptive retry manager for Phase 2 optimizations (if enabled)
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
            logger.info(
                f"Adaptive retry manager initialized "
                f"(high={phase2_config.retry_high_reliability_max}, "
                f"medium={phase2_config.retry_medium_reliability_max}, "
                f"low={phase2_config.retry_low_reliability_max})"
            )
        
        # Memory manager for Phase 2 optimizations (if enabled)
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
            logger.info(
                f"Memory manager initialized "
                f"(streaming_threshold={phase2_config.streaming_threshold_mb}MB, "
                f"idle_timeout={phase2_config.idle_session_timeout_hours}h)"
            )
        
        logger.info("CloudScraper wrapper initialized with performance optimizations")
    
    def _get_domain(self, url: str) -> str:
        """Extract domain from URL"""
        return urlparse(url).netloc
    
    def _get_domain_config(self, domain: str) -> Dict:
        """Get domain-specific configuration from config manager"""
        domain_config = config_manager.get_config(domain)
        return domain_config.to_cloudscraper_config()
    
    def _create_scraper(self, domain: str) -> cloudscraper.CloudScraper:
        """Create CloudScraper with maximum built-in features + optimized interpreter"""
        config = self._get_domain_config(domain)
        domain_config = config_manager.get_config(domain)
        
        # Use performance optimizer to select best JS interpreter
        best_interpreter = self.performance_optimizer.get_best_interpreter(domain)
        
        try:
            # Override interpreter with optimized selection
            config['interpreter'] = best_interpreter
            
            # Use CloudScraper's create_scraper with valid parameters only
            scraper = cloudscraper.create_scraper(**config)
            
            # Apply connection pool optimization if enabled
            if self.connection_pool_manager:
                # Get adaptive retry config if available
                retry_config = None
                if self.adaptive_retry_manager:
                    retry_config = self.adaptive_retry_manager.get_retry_config(domain)
                
                self.connection_pool_manager.configure_adapter(scraper, domain, retry_config)
            
            # Standardized headers for stealth and performance
            scraper.headers.update({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br', # Explicitly enable compression
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            })
            
            logger.info(f"Created CloudScraper for {domain} with {best_interpreter} interpreter (optimized)")
            return scraper
            
        except Exception as e:
            logger.error(f"Failed to create CloudScraper for {domain}: {e}")
            # Fallback to basic configuration
            try:
                scraper = cloudscraper.create_scraper(
                    interpreter=domain_config.interpreter,
                    browser={"browser": "chrome", "platform": "windows"}
                )
                logger.info(f"Created fallback CloudScraper for {domain}")
                return scraper
            except Exception as fallback_error:
                logger.error(f"Fallback CloudScraper creation failed: {fallback_error}")
                # Last resort: basic scraper
                return cloudscraper.create_scraper()
    
    async def _get_scraper(self, domain: str) -> tuple[cloudscraper.CloudScraper, Optional[SessionInfo]]:
        """
        Get or create CloudScraper instance
        
        Returns:
            Tuple of (scraper, session_info) where session_info is None if not from pool
        """
        # If session pool is enabled, try to get from pool first
        if self.session_pool_manager:
            session_info = await self.session_pool_manager.get_session(domain)
            if session_info:
                return session_info.session, session_info
        
        # Fallback to traditional session management
        # Create new scraper if needed
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
    ) -> FetchResult:
        """
        Main fetch method: Cache + CloudScraper + Monitoring
        Maximizes CloudScraper's built-in features, only adds what it lacks
        """
        domain = self._get_domain(url)
        start_time = datetime.now()
        
        # 1. Cache check (CloudScraper doesn't have caching) - using optimized cache key
        cache_key = self.performance_optimizer.generate_cache_key(url, method, {
            'headers': headers,
            'data': body
        })
        
        cached_result = await self.cache_manager.get(cache_key)
        if cached_result:
            logger.info("Cache hit for %s", url)
            return cached_result
        
        # 2. Get CloudScraper instance (with session health management)
        scraper, session_info = await self._get_scraper(domain)
        
        # Record session use for memory management
        if self.memory_manager and session_info:
            self.memory_manager.record_session_use(session_info.session_id)
        
        # Check memory pressure and trigger cleanup if needed
        if self.memory_manager:
            memory_stats = self.memory_manager.check_memory_pressure()
            if memory_stats.is_high_pressure:
                logger.warning(
                    f"High memory pressure detected ({memory_stats.percent:.1f}%), "
                    f"triggering aggressive cleanup"
                )
                # Trigger aggressive cleanup
                def cleanup_session(session_id):
                    # Remove from scrapers if it exists
                    for d, s in list(self.scrapers.items()):
                        if hasattr(s, 'session_id') and s.session_id == session_id:
                            try:
                                s.close()
                            except: pass
                            del self.scrapers[d]
                            break
                
                self.memory_manager.trigger_aggressive_cleanup(cleanup_session)
        
        try:
            # 3. Prepare request parameters
            domain_config = config_manager.get_config(domain)
            kwargs = {
                'timeout': timeout or domain_config.timeout,
            }
            
            # Merge headers (let CloudScraper handle User-Agent and other fingerprinting)
            if headers:
                # Filter out headers that CloudScraper manages automatically
                filtered_headers = {
                    k: v for k, v in headers.items() 
                    if k.lower() not in ['user-agent', 'accept', 'accept-language', 'accept-encoding']
                }
                if filtered_headers:
                    kwargs['headers'] = filtered_headers
            
            if body:
                kwargs['data'] = body
            
            # CloudScraper built-in: Proxy support
            if proxy:
                kwargs['proxies'] = {'http': proxy, 'https': proxy}
            
            # 4. Execute request using CloudScraper's built-in features
            # CloudScraper automatically handles:
            # - Cloudflare challenge detection and solving (v1/v2/v3/Turnstile)
            # - Browser fingerprinting and TLS fingerprinting
            # - JavaScript execution for challenges
            # - Automatic retries with exponential backoff
            # - Cookie and session management
            # - Request header consistency
            logger.info("Fetching %s with CloudScraper", url)
            
            response = scraper.request(method, url, **kwargs)
            
            # 5. Process response
            duration = (datetime.now() - start_time).total_seconds()
            
            # Detect if CloudScraper successfully bypassed challenges
            cf_bypassed = True
            if response.status_code in [403, 503]:
                # Check for remaining challenge indicators
                if any(indicator in response.text.lower() for indicator in [
                    'just a moment', 'challenge-platform', 'checking your browser',
                    'cloudflare', 'ddos protection', 'security check'
                ]):
                    cf_bypassed = False
                    logger.warning("CloudScraper may not have fully bypassed challenges for %s", url)
                    
                    # Retry with session recreation if first attempt failed
                    retry_count = getattr(self, '_retry_count', {}).get(url, 0)
                    if retry_count < 2:
                        if not hasattr(self, '_retry_count'):
                            self._retry_count = {}
                        self._retry_count[url] = retry_count + 1
                        
                        logger.info(f"Retrying {url} (attempt {retry_count + 1}/2) with fresh session...")
                        
                        # Delete old session to force recreation
                        if domain in self.scrapers:
                            try:
                                self.scrapers[domain].close()
                            except: pass
                            del self.scrapers[domain]
                        
                        # Add delay before retry (2-4 seconds)
                        import asyncio
                        await asyncio.sleep(2 + retry_count)
                        
                        # Recursive retry
                        result = await self.fetch(url, method, headers, body, timeout, proxy)
                        
                        # Clear retry count on success or final attempt
                        if url in self._retry_count:
                            del self._retry_count[url]
                        
                        return result
                    
                    # Clear retry count after exhausting retries
                    if hasattr(self, '_retry_count') and url in self._retry_count:
                        del self._retry_count[url]
                    
                    # Try enhanced multi-layer CF bypass as final fallback
                    domain_config = config_manager.get_config(domain)
                    if getattr(domain_config, 'retry_on_403', False):
                        logger.info(f"Trying enhanced CF bypass for {url}...")
                        try:
                            from enhanced_cf_bypass import enhanced_fetch
                            bypass_result = await enhanced_fetch(url, timeout=timeout or 30)
                            
                            if bypass_result.cf_bypassed:
                                logger.info(f"Enhanced CF bypass succeeded via {bypass_result.method_used} for {url}")
                                return FetchResult(
                                    status=bypass_result.status,
                                    html=bypass_result.html,
                                    cookies=bypass_result.cookies,
                                    headers=bypass_result.headers,
                                    cf_bypassed=True,
                                    duration=(datetime.now() - start_time).total_seconds()
                                )
                            else:
                                logger.warning(f"Enhanced CF bypass failed for {url}: {bypass_result.error}")
                        except Exception as bypass_err:
                            logger.error(f"Enhanced CF bypass error: {bypass_err}")
            
            # Handle encoding (especially for Chinese sites)
            html = response.text
            if not html and response.content:
                # Try to decode with proper encoding
                try:
                    # Check for charset in content-type or meta tags
                    content_type = response.headers.get('content-type', '').lower()
                    if 'gbk' in content_type or 'gb2312' in content_type:
                        html = response.content.decode('gbk', errors='replace')
                    elif 'charset=gbk' in response.content[:2000].decode('utf-8', errors='ignore').lower():
                        html = response.content.decode('gbk', errors='replace')
                    else:
                        html = response.content.decode('utf-8', errors='replace')
                except Exception:
                    html = response.content.decode('utf-8', errors='replace')
            
            result = FetchResult(
                status=response.status_code,
                html=html,
                cookies=dict(response.cookies),
                headers=dict(response.headers),
                cf_bypassed=cf_bypassed,
                duration=duration
            )
            
            # 6. Cache successful results (CloudScraper doesn't have caching)
            if response.status_code == 200:
                await self.cache_manager.set(cache_key, result, ttl=900)  # 15 min for success
            elif response.status_code in [403, 503]:
                await self.cache_manager.set(cache_key, result, ttl=60)   # 1 min for errors
            
            # 7. Record success metrics (CloudScraper doesn't have monitoring)
            self.health_monitor.record_success(domain, duration)
            
            # Record successful attempt for adaptive retry
            if self.adaptive_retry_manager:
                self.adaptive_retry_manager.record_attempt(domain, success=True)
            
            # Check for degraded domains and trigger auto-recovery (Phase 2)
            if phase2_config.health_monitoring_enabled and phase2_config.health_auto_recovery_enabled:
                # Define recovery function for degraded domains
                async def recover_domain(degraded_domain: str):
                    logger.warning(f"Auto-recovery triggered for degraded domain: {degraded_domain}")
                    # Reset all sessions for the degraded domain
                    if degraded_domain in self.scrapers:
                        try:
                            self.scrapers[degraded_domain].close()
                        except: pass
                        del self.scrapers[degraded_domain]
                        logger.info(f"Removed session for degraded domain: {degraded_domain}")
                    
                    if self.session_pool_manager:
                        await self.session_pool_manager.clear_pool(degraded_domain)
                    
                    # Reset health stats for the domain
                    if hasattr(self.health_monitor, 'reset_domain_stats'):
                        self.health_monitor.reset_domain_stats(degraded_domain)
                
                # Trigger recovery if domain is degraded
                await self.health_monitor.trigger_recovery(domain, recover_domain)
            
            # Return session to pool if it came from pool
            if session_info:
                session_info.record_success()
                await self.session_pool_manager.return_session(domain, session_info)
            
            logger.info(f"CloudScraper fetch completed: {response.status_code} in {duration:.2f}s")
            return result
            
        except Exception as e:
            # 8. Error handling and monitoring (CloudScraper doesn't have this)
            duration = (datetime.now() - start_time).total_seconds()
            error_msg = str(e)
            
            logger.error("CloudScraper fetch failed for %s: %s", url, error_msg)
            
            # Record error metrics
            self.health_monitor.record_error(domain, error_msg)
            
            # Record failed attempt for adaptive retry
            if self.adaptive_retry_manager:
                self.adaptive_retry_manager.record_attempt(domain, success=False)
                # Format error with retry statistics
                error_msg = self.adaptive_retry_manager.format_exhausted_error(domain, error_msg)
            
            # Record connection error if connection pool is enabled
            if self.connection_pool_manager:
                self.connection_pool_manager.record_connection_error(domain)
            
            # Record error on session if it came from pool
            if session_info:
                session_info.record_error()
                # Don't return error-prone sessions to pool
                if not session_info.is_error_prone():
                    await self.session_pool_manager.return_session(domain, session_info)
            
            # Return error result
            result = FetchResult(
                status=500,
                html="",
                cookies={},
                headers={},
                cf_bypassed=False,
                error=error_msg,
                duration=duration
            )
            
            # Cache errors briefly to avoid repeated failures
            await self.cache_manager.set(cache_key, result, ttl=60)
            
            return result
    
    def get_cached_tokens(self, url: str) -> Optional[Dict]:
        """Get cached tokens for compatibility with existing API"""
        domain = self._get_domain(url)
        if domain in self.scrapers:
            scraper = self.scrapers[domain]
            return {
                "cookies": dict(scraper.cookies),
                "user_agent": scraper.headers.get("User-Agent", "CloudScraper")
            }
        return None
    
    async def fetch_parallel(self, requests: list) -> list:
        """
        Fetch multiple URLs in parallel using performance optimizer
        
        Args:
            requests: List of dicts with keys: url, method, headers, body, timeout, proxy
        
        Returns:
            List of FetchResult objects
        """
        logger.info(f"Parallel fetch: {len(requests)} requests")
        
        # Use performance optimizer's parallel engine
        return await self.performance_optimizer.fetch_parallel(
            requests,
            lambda **kwargs: self.fetch(**kwargs)
        )
    
    async def fetch_batch(self, urls: list, **common_kwargs) -> list:
        """
        Batch fetch multiple URLs with common parameters
        
        Args:
            urls: List of URLs to fetch
            **common_kwargs: Common parameters for all requests (method, headers, etc.)
        
        Returns:
            List of FetchResult objects
        """
        logger.info(f"Batch fetch: {len(urls)} URLs")
        
        # Build request list
        requests = [
            {'url': url, **common_kwargs}
            for url in urls
        ]
        
        return await self.fetch_parallel(requests)
    
    async def warmup_domain(self, domain: str) -> Dict:
        """
        Warmup session pool for a domain
        
        Args:
            domain: Domain to warmup
        
        Returns:
            Dictionary with warmup status and statistics
        """
        if not self.session_pool_manager:
            return {
                "success": False,
                "error": "Session pool is not enabled"
            }
        
        try:
            await self.session_pool_manager.warmup_domain(domain)
            stats = self.session_pool_manager.get_pool_stats(domain)
            
            return {
                "success": True,
                "domain": domain,
                "pool_size": stats.get('pool_size', 0),
                "warmup_time": stats.get('warmup_times', [])[-1] if stats.get('warmup_times') else 0,
                "stats": stats
            }
        except Exception as e:
            logger.error(f"Failed to warmup domain {domain}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_stats(self) -> Dict:
        """Get comprehensive statistics including performance metrics"""
        # Get health stats - use enhanced method if available
        if hasattr(self.health_monitor, 'get_health_stats'):
            health_stats = self.health_monitor.get_health_stats()
        else:
            health_stats = self.health_monitor.get_stats()
        
        perf_stats = self.performance_optimizer.get_comprehensive_stats()
        
        stats = {
            "active_sessions": len(self.scrapers),
            "domains": list(self.scrapers.keys()),
            "health_stats": health_stats,
            "cache_available": self.cache_manager.redis is not None,
            "engine": "CloudScraper",
            "version": "5.0.0",
            "performance": perf_stats
        }
        
        # Add session pool stats if enabled
        if self.session_pool_manager:
            stats["session_pool"] = self.session_pool_manager.get_pool_stats()
        
        # Add connection pool stats if enabled
        if self.connection_pool_manager:
            stats["connection_pool"] = {
                "global": self.connection_pool_manager.get_pool_stats(),
                "by_domain": self.connection_pool_manager.get_all_domain_stats(),
                "configuration": self.connection_pool_manager.get_configuration()
            }
        
        # Add adaptive retry stats if enabled
        if self.adaptive_retry_manager:
            stats["adaptive_retry"] = {
                "by_domain": self.adaptive_retry_manager.get_retry_stats(),
                "configuration": self.adaptive_retry_manager.get_configuration()
            }
        
        # Add memory stats if enabled
        if self.memory_manager:
            stats["memory"] = self.memory_manager.get_memory_stats()
        
        # Add enhanced health monitoring stats if enabled
        if phase2_config.health_monitoring_enabled and hasattr(self.health_monitor, 'get_degraded_domains'):
            stats["health_monitoring"] = {
                "degraded_domains": self.health_monitor.get_degraded_domains(),
                "auto_recovery_enabled": phase2_config.health_auto_recovery_enabled
            }
        
        return stats
    
    async def shutdown(self):
        """Cleanup resources"""
        # Shutdown session pool manager
        if self.session_pool_manager:
            await self.session_pool_manager.stop()
        
        # Shutdown performance optimizer
        await self.performance_optimizer.shutdown()
        
        # CloudScraper sessions don't need explicit cleanup
        self.scrapers.clear()
        
        # Close Redis connection if available
        if self.cache_manager.redis:
            try:
                await self.cache_manager.redis.close()
            except Exception:
                pass  # Ignore errors during shutdown cleanup
        
        logger.info("CloudScraper wrapper shutdown complete")

# ─────────────────────────────────────────────────────────────
# Singleton instance
# ─────────────────────────────────────────────────────────────

# Create the wrapper instance
wrapper = CloudScraperWrapper()