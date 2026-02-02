"""
Session Pool Manager for CF Bypass Service
Manages a pool of pre-initialized CloudScraper sessions for fast request handling.

Performance optimizations:
- Uses deque for O(1) pop operations instead of list O(n)
- Caches datetime.now() calls to reduce object creation
- In-place filtering for stale session removal
- Consolidated statistics updates
"""
import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, Deque, List, Optional, Any
from collections import defaultdict, deque
import cloudscraper

from config import phase2_config

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────

@dataclass
class SessionInfo:
    """
    Information about a CloudScraper session in the pool
    """
    session: cloudscraper.CloudScraper
    created_at: datetime
    last_used: datetime
    request_count: int = 0
    error_count: int = 0
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    def is_stale(self, max_age_hours: int = 1, now: Optional[datetime] = None) -> bool:
        """
        Check if session is stale based on age
        
        Args:
            max_age_hours: Maximum age in hours before session is considered stale
            now: Current time (optional, for performance optimization)
        
        Returns:
            True if session is stale, False otherwise
        """
        if now is None:
            now = datetime.now()
        age = now - self.created_at
        return age.total_seconds() > (max_age_hours * 3600)
    
    def is_error_prone(self, threshold: float = 0.5) -> bool:
        """
        Check if session has high error rate
        
        Args:
            threshold: Error rate threshold (0.0 to 1.0)
        
        Returns:
            True if error rate exceeds threshold, False otherwise
        """
        if self.request_count == 0:
            return False
        return (self.error_count / self.request_count) > threshold
    
    def record_success(self, now: Optional[datetime] = None) -> None:
        """Record a successful request"""
        self.request_count += 1
        self.last_used = now if now else datetime.now()
    
    def record_error(self, now: Optional[datetime] = None) -> None:
        """Record a failed request"""
        self.request_count += 1
        self.error_count += 1
        self.last_used = now if now else datetime.now()


@dataclass
class PoolStats:
    """
    Statistics for a session pool
    """
    domain: str
    pool_size: int = 0
    hits: int = 0
    misses: int = 0
    warmup_times: List[float] = field(default_factory=list)
    last_warmup: Optional[datetime] = None
    total_sessions_created: int = 0
    stale_sessions_removed: int = 0
    
    @property
    def hit_rate(self) -> float:
        """Calculate pool hit rate"""
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0
    
    @property
    def warmup_time_avg(self) -> float:
        """Calculate average warmup time"""
        return sum(self.warmup_times) / len(self.warmup_times) if self.warmup_times else 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            'domain': self.domain,
            'pool_size': self.pool_size,
            'hits': self.hits,
            'misses': self.misses,
            'hit_rate': self.hit_rate,
            'warmup_time_avg': self.warmup_time_avg,
            'last_warmup': self.last_warmup.isoformat() if self.last_warmup else None,
            'total_sessions_created': self.total_sessions_created,
            'stale_sessions_removed': self.stale_sessions_removed
        }


# ─────────────────────────────────────────────────────────────
# Session Pool Manager
# ─────────────────────────────────────────────────────────────

class SessionPoolManager:
    """
    Manages a pool of pre-initialized CloudScraper sessions
    
    Features:
    - Pre-warming sessions for configured domains
    - Automatic pool replenishment
    - Stale session detection and removal
    - Pool statistics tracking
    """
    
    def __init__(
        self,
        pool_size: int = None,
        min_threshold: int = None,
        max_age_hours: int = None,
        create_session_func = None
    ):
        """
        Initialize session pool manager
        
        Args:
            pool_size: Number of sessions to maintain per domain
            min_threshold: Minimum pool size before triggering replenishment
            max_age_hours: Maximum session age in hours
            create_session_func: Function to create new sessions
        """
        self.pool_size = pool_size or phase2_config.session_pool_size
        self.min_threshold = min_threshold or phase2_config.session_pool_min_threshold
        self.max_age_hours = max_age_hours or phase2_config.session_max_age_hours
        self.create_session_func = create_session_func
        
        # Pool storage: domain -> deque of SessionInfo (O(1) popleft instead of O(n) pop(0))
        self.pools: Dict[str, Deque[SessionInfo]] = defaultdict(deque)
        
        # Statistics: domain -> PoolStats
        self.stats: Dict[str, PoolStats] = defaultdict(lambda: PoolStats(domain=''))
        
        # Background tasks
        self._replenishment_task: Optional[asyncio.Task] = None
        self._health_check_task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()  # Prevent concurrent modifications to pools
        
        logger.info(
            f"SessionPoolManager initialized: pool_size={self.pool_size}, "
            f"min_threshold={self.min_threshold}, max_age_hours={self.max_age_hours}"
        )
    
    async def start(self) -> None:
        """Start background tasks"""
        if not self._running:
            self._running = True
            self._replenishment_task = asyncio.create_task(self._replenishment_loop())
            self._health_check_task = asyncio.create_task(self._health_check_loop())
            logger.info("SessionPoolManager background tasks started")
    
    async def stop(self) -> None:
        """Stop background tasks"""
        self._running = False
        
        if self._replenishment_task:
            self._replenishment_task.cancel()
            try:
                await self._replenishment_task
            except asyncio.CancelledError:
                pass
        
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
        
        logger.info("SessionPoolManager stopped")
    
    async def warmup_domain(self, domain: str) -> None:
        """
        Pre-create sessions for a domain
        
        Args:
            domain: Domain to warm up
        """
        start_time = datetime.now()
        
        logger.info(f"Warming up session pool for {domain} (target size: {self.pool_size})")
        
        # Create sessions in parallel
        tasks = []
        for i in range(self.pool_size):
            task = self._create_session_info(domain)
            tasks.append(task)
        
        sessions = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Add successful sessions to pool
        successful = 0
        async with self._lock:
            for session in sessions:
                if isinstance(session, SessionInfo):
                    self.pools[domain].append(session)
                    successful += 1
                else:
                    logger.error(f"Failed to create session for {domain}: {session}")
        
        # Update statistics
        duration = (datetime.now() - start_time).total_seconds()
        stats = self.stats[domain]
        stats.domain = domain
        stats.pool_size = len(self.pools[domain])
        stats.warmup_times.append(duration)
        stats.last_warmup = datetime.now()
        stats.total_sessions_created += successful
        
        logger.info(
            f"Warmup complete for {domain}: {successful}/{self.pool_size} sessions "
            f"created in {duration:.2f}s"
        )
    
    async def get_session(self, domain: str) -> Optional[SessionInfo]:
        """
        Get a session from the pool (O(1) operation using deque)
        
        Args:
            domain: Domain to get session for
        
        Returns:
            SessionInfo if available, None if pool is empty
        """
        async with self._lock:
            pool = self.pools[domain]
            stats = self.stats[domain]
            stats.domain = domain
            
            if pool:
                # Get oldest session (FIFO) - O(1) with deque.popleft()
                session_info = pool.popleft()
                stats.hits += 1
                stats.pool_size = len(pool)
                
                logger.debug(f"Pool hit for {domain}: {len(pool)} sessions remaining")
                
                # Trigger replenishment if below threshold
                if len(pool) < self.min_threshold:
                    asyncio.create_task(self.replenish_pool(domain))
                
                return session_info
            else:
                stats.misses += 1
                logger.debug(f"Pool miss for {domain}: pool is empty")
                
                # Trigger replenishment
                asyncio.create_task(self.replenish_pool(domain))
                
                return None
    
    async def return_session(self, domain: str, session_info: SessionInfo) -> None:
        """
        Return a session to the pool
        
        Args:
            domain: Domain the session belongs to
            session_info: Session to return
        """
        # Cache current time for performance
        now = datetime.now()
        
        # Check if session is still healthy
        if session_info.is_stale(self.max_age_hours, now) or session_info.is_error_prone():
            logger.debug(
                f"Not returning session to pool for {domain}: "
                f"stale={session_info.is_stale(self.max_age_hours, now)}, "
                f"error_prone={session_info.is_error_prone()}"
            )
            self.stats[domain].stale_sessions_removed += 1
            # Don't return to pool, let it be garbage collected
            return
        
        # Return to pool if not full
        async with self._lock:
            pool = self.pools[domain]
            if len(pool) < self.pool_size:
                pool.append(session_info)
                self.stats[domain].pool_size = len(pool)
                logger.debug(f"Session returned to pool for {domain}: {len(pool)} sessions")
            else:
                logger.debug(f"Pool full for {domain}, retiring session")
                try:
                    session_info.session.close()
                except:
                    pass
    
    async def replenish_pool(self, domain: str) -> None:
        """
        Asynchronously replenish the pool
        
        Args:
            domain: Domain to replenish pool for
        """
        pool = self.pools[domain]
        current_size = len(pool)
        
        if current_size >= self.pool_size:
            return  # Pool is already full
        
        needed = self.pool_size - current_size
        logger.info(f"Replenishing pool for {domain}: need {needed} sessions")
        
        # Create needed sessions in parallel
        tasks = [self._create_session_info(domain) for _ in range(needed)]
        sessions = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Add successful sessions to pool
        added = 0
        async with self._lock:
            for session in sessions:
                if isinstance(session, SessionInfo):
                    # Check if pool became full in the meantime
                    if len(pool) < self.pool_size:
                        pool.append(session)
                        added += 1
                    else:
                        # retire session if pool is full
                        try:
                            session.session.close()
                        except:
                            pass
                else:
                    logger.error(f"Failed to create session during replenishment: {session}")
        
        # Update statistics
        stats = self.stats[domain]
        stats.pool_size = len(pool)
        stats.total_sessions_created += added
        
        logger.info(f"Replenishment complete for {domain}: added {added} sessions")
    
    async def _create_session_info(self, domain: str) -> SessionInfo:
        """
        Create a new SessionInfo with a CloudScraper session
        
        Args:
            domain: Domain for the session
        
        Returns:
            SessionInfo with initialized session
        """
        if self.create_session_func:
            session = await asyncio.to_thread(self.create_session_func, domain)
        else:
            # Default: create basic CloudScraper session
            session = await asyncio.to_thread(cloudscraper.create_scraper)
        
        now = datetime.now()
        return SessionInfo(
            session=session,
            created_at=now,
            last_used=now
        )
    
    async def _replenishment_loop(self) -> None:
        """Background task for continuous pool replenishment"""
        while self._running:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds
                
                for domain, pool in self.pools.items():
                    if len(pool) < self.min_threshold:
                        logger.debug(f"Auto-replenishment triggered for {domain}")
                        await self.replenish_pool(domain)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in replenishment loop: {e}")
    
    async def _health_check_loop(self) -> None:
        """Background task for checking and removing stale sessions (optimized in-place filtering)"""
        while self._running:
            try:
                await asyncio.sleep(300)  # Check every 5 minutes
                
                # Cache current time for all checks
                now = datetime.now()
                
                for domain, pool in self.pools.items():
                    # In-place filtering: only rebuild if needed
                    async with self._lock:
                        original_size = len(pool)
                        
                        # Identify sessions to retire
                        to_retire = [s for s in pool if s.is_stale(self.max_age_hours, now) or s.is_error_prone()]
                        
                        if to_retire:
                            # Filter out stale sessions
                            healthy_sessions = deque(s for s in pool if s not in to_retire)
                            self.pools[domain] = healthy_sessions
                            
                            removed = original_size - len(healthy_sessions)
                            logger.info(f"Removed {removed} stale sessions from {domain} pool")
                            self.stats[domain].stale_sessions_removed += removed
                            self.stats[domain].pool_size = len(healthy_sessions)
                            
                            # Close retired sessions
                            for s in to_retire:
                                try:
                                    s.session.close()
                                except:
                                    pass
                            
                            # Trigger replenishment
                            await self.replenish_pool(domain)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in health check loop: {e}")
    
    async def clear_pool(self, domain: str) -> int:
        """
        Clear all sessions in a domain's pool
        
        Returns:
            Number of sessions removed and closed
        """
        async with self._lock:
            if domain not in self.pools:
                return 0
            
            pool = self.pools[domain]
            count = len(pool)
            
            # Close all sessions in the pool
            for session_info in pool:
                try:
                    session_info.session.close()
                except:
                    pass
            
            pool.clear()
            self.stats[domain].pool_size = 0
            
            logger.info(f"Cleared session pool for {domain} ({count} sessions closed)")
            return count
    
    def get_pool_stats(self, domain: Optional[str] = None) -> Dict[str, Any]:
        """
        Get pool statistics
        
        Args:
            domain: Specific domain to get stats for, or None for all domains
        
        Returns:
            Dictionary of statistics
        """
        if domain:
            stats = self.stats.get(domain)
            if stats:
                return stats.to_dict()
            return {}
        else:
            return {
                domain: stats.to_dict()
                for domain, stats in self.stats.items()
            }
    
    def get_pool_size(self, domain: str) -> int:
        """Get current pool size for a domain"""
        return len(self.pools.get(domain, []))


# ─────────────────────────────────────────────────────────────
# Global instance (will be initialized by CloudScraperWrapper)
# ─────────────────────────────────────────────────────────────

session_pool_manager: Optional[SessionPoolManager] = None
