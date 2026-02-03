"""
Standardized Interfaces for CF Bypass Service Components
Provides loose coupling and high cohesion through standardized contracts
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Protocol, AsyncGenerator
from dataclasses import dataclass
from datetime import datetime
import asyncio
from enum import Enum


# ===== Core Interfaces =====

class BypassEngine(Protocol):
    """Standard interface for CF bypass engines"""

    @property
    def name(self) -> str:
        """Engine name"""
        ...

    @property
    def version(self) -> str:
        """Engine version"""
        ...

    async def fetch(self, url: str, method: str = "GET", headers: Optional[Dict[str, str]] = None,
                   body: Optional[str] = None, timeout: int = 30,
                   proxy: Optional[str] = None, **kwargs) -> 'BypassResult':
        """Execute bypass request"""
        ...

    async def warmup(self, domain: str) -> bool:
        """Warm up session for domain"""
        ...

    def get_stats(self) -> Dict[str, Any]:
        """Get engine statistics"""
        ...


class Cache(Protocol):
    """Standard interface for caching backends"""

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        ...

    async def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """Set value in cache with TTL"""
        ...

    async def delete(self, key: str) -> bool:
        """Delete value from cache"""
        ...

    async def clear(self) -> None:
        """Clear all cache entries"""
        ...

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        ...


class ConfigProvider(Protocol):
    """Standard interface for configuration providers"""

    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        ...

    def set(self, key: str, value: Any) -> None:
        """Set configuration value"""
        ...

    def get_all(self) -> Dict[str, Any]:
        """Get all configuration values"""
        ...

    def add_listener(self, callback: callable) -> None:
        """Add configuration change listener"""
        ...


class HealthMonitor(Protocol):
    """Standard interface for health monitoring"""

    def record_success(self, domain: str, duration: float) -> None:
        """Record successful request"""
        ...

    def record_error(self, domain: str, error: str) -> None:
        """Record failed request"""
        ...

    def get_health_status(self, domain: Optional[str] = None) -> Dict[str, Any]:
        """Get health status"""
        ...

    def get_stats(self) -> Dict[str, Any]:
        """Get health statistics"""
        ...


class MetricsCollector(Protocol):
    """Standard interface for metrics collection"""

    def increment_counter(self, name: str, value: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment counter metric"""
        ...

    def set_gauge(self, name: str, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Set gauge metric"""
        ...

    def observe_histogram(self, name: str, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Observe histogram metric"""
        ...

    def get_metrics(self) -> Dict[str, Any]:
        """Get collected metrics"""
        ...


# ===== Data Structures =====

class HealthState(Enum):
    """Health state enumeration"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class BypassResult:
    """Standardized bypass result"""
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    duration: float
    engine: str
    error: Optional[str] = None
    cached: bool = False
    timestamp: Optional[datetime] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


@dataclass
class EngineStats:
    """Engine performance statistics"""
    name: str
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    average_response_time: float = 0.0
    uptime_seconds: float = 0.0
    memory_usage_mb: Optional[float] = None
    active_sessions: int = 0

    @property
    def success_rate(self) -> float:
        """Calculate success rate"""
        total = self.total_requests
        return self.successful_requests / total if total > 0 else 0.0

    @property
    def error_rate(self) -> float:
        """Calculate error rate"""
        return 1.0 - self.success_rate


@dataclass
class CacheStats:
    """Cache performance statistics"""
    total_entries: int = 0
    hit_count: int = 0
    miss_count: int = 0
    eviction_count: int = 0
    total_size_bytes: int = 0

    @property
    def hit_rate(self) -> float:
        """Calculate cache hit rate"""
        total = self.hit_count + self.miss_count
        return self.hit_count / total if total > 0 else 0.0


@dataclass
class HealthStats:
    """Health monitoring statistics"""
    total_domains: int = 0
    healthy_domains: int = 0
    degraded_domains: int = 0
    unhealthy_domains: int = 0
    total_checks: int = 0
    successful_checks: int = 0
    average_response_time: float = 0.0


@dataclass
class DomainHealth:
    """Domain health status"""
    domain: str
    state: HealthState
    error_rate: float
    average_response_time: float
    last_check: datetime
    total_requests: int
    successful_requests: int
    failed_requests: int


# ===== Abstract Base Classes =====

class BaseBypassEngine(ABC):
    """Abstract base class for bypass engines"""

    def __init__(self, name: str):
        self._name = name
        self._start_time = datetime.now()
        self._stats = EngineStats(name=name)

    @property
    def name(self) -> str:
        return self._name

    @property
    def version(self) -> str:
        return "1.0.0"  # Default version

    @abstractmethod
    async def fetch(self, url: str, method: str = "GET", headers: Optional[Dict[str, str]] = None,
                   body: Optional[str] = None, timeout: int = 30,
                   proxy: Optional[str] = None, **kwargs) -> BypassResult:
        """Execute bypass request"""
        pass

    @abstractmethod
    async def warmup(self, domain: str) -> bool:
        """Warm up session for domain"""
        pass

    def get_stats(self) -> Dict[str, Any]:
        """Get engine statistics"""
        self._stats.uptime_seconds = (datetime.now() - self._start_time).total_seconds()
        return {
            "name": self._stats.name,
            "version": self.version,
            "total_requests": self._stats.total_requests,
            "successful_requests": self._stats.successful_requests,
            "failed_requests": self._stats.failed_requests,
            "success_rate": self._stats.success_rate,
            "average_response_time": self._stats.average_response_time,
            "uptime_seconds": self._stats.uptime_seconds,
            "memory_usage_mb": self._stats.memory_usage_mb,
            "active_sessions": self._stats.active_sessions,
        }

    def _record_request(self, success: bool, duration: float) -> None:
        """Record request statistics"""
        self._stats.total_requests += 1
        if success:
            self._stats.successful_requests += 1
        else:
            self._stats.failed_requests += 1

        # Update rolling average response time
        if self._stats.total_requests == 1:
            self._stats.average_response_time = duration
        else:
            alpha = 0.1  # Exponential moving average factor
            self._stats.average_response_time = (
                self._stats.average_response_time * (1 - alpha) + duration * alpha
            )

    async def shutdown(self) -> None:
        """Optional cleanup method"""
        pass


class BaseCache(ABC):
    """Abstract base class for cache implementations"""

    def __init__(self):
        self._stats = CacheStats()

    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        pass

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """Set value in cache with TTL"""
        pass

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """Delete value from cache"""
        pass

    @abstractmethod
    async def clear(self) -> None:
        """Clear all cache entries"""
        pass

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            "total_entries": self._stats.total_entries,
            "hit_count": self._stats.hit_count,
            "miss_count": self._stats.miss_count,
            "eviction_count": self._stats.eviction_count,
            "hit_rate": self._stats.hit_rate,
            "total_size_bytes": self._stats.total_size_bytes,
        }


# ===== Factory Interfaces =====

class EngineFactory(Protocol):
    """Factory interface for creating engines"""

    def create_engine(self, engine_type: str, **kwargs) -> BypassEngine:
        """Create engine instance"""
        ...

    def get_available_engines(self) -> List[str]:
        """Get list of available engine types"""
        ...


class CacheFactory(Protocol):
    """Factory interface for creating caches"""

    def create_cache(self, cache_type: str, **kwargs) -> Cache:
        """Create cache instance"""
        ...

    def get_available_caches(self) -> List[str]:
        """Get list of available cache types"""
        ...