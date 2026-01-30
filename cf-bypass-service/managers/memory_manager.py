"""
Memory Manager for CF Bypass Service
Implements memory optimization strategies to reduce memory consumption.

Performance improvements:
- Streaming mode for large responses (>10MB)
- Automatic idle session cleanup (>1 hour idle)
- LRU cache eviction with size limits
- Aggressive cleanup when memory usage >80%
- Memory usage monitoring and warnings
"""
import logging
import psutil
import gc
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass
class MemoryStats:
    """Memory usage statistics"""
    total_mb: float
    available_mb: float
    used_mb: float
    percent: float
    threshold_mb: float
    
    @property
    def usage_percent(self) -> float:
        """Calculate usage percentage"""
        return self.percent
    
    @property
    def is_high_pressure(self) -> bool:
        """Check if memory pressure is high (>80%)"""
        return self.percent > 80.0


class MemoryManager:
    """
    Manages memory optimization strategies
    
    Features:
    - Streaming mode for large responses
    - Idle session cleanup
    - LRU cache eviction
    - Aggressive cleanup on high memory pressure
    - Memory usage monitoring
    """
    
    def __init__(
        self,
        streaming_threshold_mb: int = 10,
        idle_session_timeout_hours: int = 1,
        aggressive_cleanup_threshold: float = 0.8,
        cache_size_limit: int = 10000,
        cleanup_interval_minutes: int = 5,
        enable_monitoring: bool = True
    ):
        """
        Initialize memory manager
        
        Args:
            streaming_threshold_mb: Response size threshold for streaming (default: 10MB)
            idle_session_timeout_hours: Timeout for idle sessions (default: 1 hour)
            aggressive_cleanup_threshold: Memory threshold for aggressive cleanup (default: 0.8)
            cache_size_limit: Maximum cache entries (default: 10000)
            cleanup_interval_minutes: Cleanup interval (default: 5 minutes)
            enable_monitoring: Enable memory monitoring (default: True)
        """
        self.streaming_threshold_mb = streaming_threshold_mb
        self.idle_session_timeout_hours = idle_session_timeout_hours
        self.aggressive_cleanup_threshold = aggressive_cleanup_threshold
        self.cache_size_limit = cache_size_limit
        self.cleanup_interval_minutes = cleanup_interval_minutes
        self.enable_monitoring = enable_monitoring
        
        # Session tracking: {session_id: last_used_time}
        self._session_last_used: Dict[str, datetime] = {}
        
        # Statistics
        self._cleanup_count = 0
        self._last_cleanup = datetime.now()
        
        logger.info(
            f"MemoryManager initialized: "
            f"streaming_threshold={streaming_threshold_mb}MB, "
            f"idle_timeout={idle_session_timeout_hours}h, "
            f"cache_limit={cache_size_limit}"
        )
    
    def should_stream_response(self, content_length: Optional[int]) -> bool:
        """
        Check if response should be streamed based on size
        
        Args:
            content_length: Response content length in bytes (None if unknown)
        
        Returns:
            True if response should be streamed
        """
        if content_length is None:
            return False
        
        # Convert to MB
        size_mb = content_length / (1024 * 1024)
        
        should_stream = size_mb > self.streaming_threshold_mb
        
        if should_stream:
            logger.info(
                f"Response size {size_mb:.2f}MB exceeds threshold "
                f"{self.streaming_threshold_mb}MB, using streaming mode"
            )
        
        return should_stream
    
    def record_session_use(self, session_id: str) -> None:
        """
        Record session usage timestamp
        
        Args:
            session_id: Session identifier
        """
        self._session_last_used[session_id] = datetime.now()
    
    def get_idle_sessions(self) -> list[str]:
        """
        Get list of idle sessions that exceed timeout
        
        Returns:
            List of idle session IDs
        """
        now = datetime.now()
        timeout = timedelta(hours=self.idle_session_timeout_hours)
        
        idle_sessions = []
        for session_id, last_used in self._session_last_used.items():
            if now - last_used > timeout:
                idle_sessions.append(session_id)
        
        return idle_sessions
    
    def cleanup_idle_sessions(self, session_cleanup_func: callable) -> int:
        """
        Cleanup idle sessions
        
        Args:
            session_cleanup_func: Function to cleanup a session (takes session_id)
        
        Returns:
            Number of sessions cleaned up
        """
        idle_sessions = self.get_idle_sessions()
        
        if not idle_sessions:
            return 0
        
        logger.info(f"Cleaning up {len(idle_sessions)} idle sessions")
        
        for session_id in idle_sessions:
            try:
                session_cleanup_func(session_id)
                del self._session_last_used[session_id]
            except Exception as e:
                logger.error(f"Failed to cleanup session {session_id}: {e}")
        
        self._cleanup_count += len(idle_sessions)
        self._last_cleanup = datetime.now()
        
        return len(idle_sessions)
    
    def check_memory_pressure(self) -> MemoryStats:
        """
        Check current memory pressure
        
        Returns:
            MemoryStats with current memory usage
        """
        if not self.enable_monitoring:
            # Return dummy stats if monitoring disabled
            return MemoryStats(
                total_mb=0,
                available_mb=0,
                used_mb=0,
                percent=0,
                threshold_mb=0
            )
        
        try:
            memory = psutil.virtual_memory()
            
            stats = MemoryStats(
                total_mb=memory.total / (1024 * 1024),
                available_mb=memory.available / (1024 * 1024),
                used_mb=memory.used / (1024 * 1024),
                percent=memory.percent,
                threshold_mb=(memory.total * self.aggressive_cleanup_threshold) / (1024 * 1024)
            )
            
            # Log warning if approaching threshold
            if stats.percent > (self.aggressive_cleanup_threshold * 100 * 0.9):
                logger.warning(
                    f"Memory usage approaching threshold: {stats.percent:.1f}% "
                    f"(threshold: {self.aggressive_cleanup_threshold * 100:.0f}%)"
                )
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to check memory pressure: {e}")
            return MemoryStats(
                total_mb=0,
                available_mb=0,
                used_mb=0,
                percent=0,
                threshold_mb=0
            )
    
    def trigger_aggressive_cleanup(
        self,
        session_cleanup_func: callable,
        force_gc: bool = True
    ) -> Dict[str, int]:
        """
        Trigger aggressive cleanup when memory pressure is high
        
        Args:
            session_cleanup_func: Function to cleanup sessions
            force_gc: Force garbage collection (default: True)
        
        Returns:
            Dictionary with cleanup statistics
        """
        logger.warning("Triggering aggressive memory cleanup")
        
        stats = {
            'sessions_cleaned': 0,
            'cache_entries_evicted': 0,
            'gc_collected': 0
        }
        
        # 1. Cleanup ALL idle sessions (not just >1 hour, but >30 minutes)
        old_timeout = self.idle_session_timeout_hours
        self.idle_session_timeout_hours = 0.5  # 30 minutes
        stats['sessions_cleaned'] = self.cleanup_idle_sessions(session_cleanup_func)
        self.idle_session_timeout_hours = old_timeout
        
        # 2. Force garbage collection
        if force_gc:
            stats['gc_collected'] = gc.collect()
            logger.info(f"Garbage collection freed {stats['gc_collected']} objects")
        
        logger.warning(
            f"Aggressive cleanup completed: "
            f"{stats['sessions_cleaned']} sessions, "
            f"{stats['gc_collected']} GC objects"
        )
        
        return stats
    
    def get_memory_stats(self) -> Dict[str, Any]:
        """
        Get comprehensive memory statistics
        
        Returns:
            Dictionary with memory statistics
        """
        memory_pressure = self.check_memory_pressure()
        
        return {
            'memory': {
                'total_mb': memory_pressure.total_mb,
                'available_mb': memory_pressure.available_mb,
                'used_mb': memory_pressure.used_mb,
                'usage_percent': memory_pressure.usage_percent,
                'threshold_mb': memory_pressure.threshold_mb,
                'is_high_pressure': memory_pressure.is_high_pressure
            },
            'sessions': {
                'tracked': len(self._session_last_used),
                'idle': len(self.get_idle_sessions()),
                'cleanup_count': self._cleanup_count,
                'last_cleanup': self._last_cleanup.isoformat() if self._last_cleanup else None
            },
            # Cache logic moved to Redis (CacheManager)
            'configuration': {
                'streaming_threshold_mb': self.streaming_threshold_mb,
                'idle_session_timeout_hours': self.idle_session_timeout_hours,
                'aggressive_cleanup_threshold': self.aggressive_cleanup_threshold,
                'cache_size_limit': self.cache_size_limit,
                'cleanup_interval_minutes': self.cleanup_interval_minutes
            }
        }
