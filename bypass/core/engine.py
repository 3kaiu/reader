"""
Base Bypass Engine Abstraction
Unified interface for all bypass engines (Scraper, Mesh, etc.)
"""
import abc
import time
from enum import Enum, auto
from typing import Dict, Any, Optional
from dataclasses import dataclass, field

@dataclass
class BypassResult:
    status: int
    html: str
    cookies: Dict[str, str] = field(default_factory=dict)
    headers: Dict[str, str] = field(default_factory=dict)
    cf_bypassed: bool = False
    duration: float = 0.0
    engine: str = "unknown"
    error: Optional[str] = None
    cached: bool = False

class CircuitState(Enum):
    CLOSED = auto()
    OPEN = auto()
    HALF_OPEN = auto()


class DomainProfile:
    """Per-domain adaptive solving profile with circuit breaker."""

    METHOD_TWO_PHASE = "two_phase"
    METHOD_PLAYWRIGHT = "playwright"
    METHOD_SCRAPER = "scraper"
    METHOD_ALL = (METHOD_TWO_PHASE, METHOD_PLAYWRIGHT, METHOD_SCRAPER)

    FAILURE_THRESHOLD = 3
    COOLDOWN_SECONDS = 60

    def __init__(self, domain: str):
        self.domain = domain
        self._history: list[tuple[str, float, bool]] = []
        self._consecutive_failures = 0
        self._circuit_state = CircuitState.CLOSED
        self._cooldown_until: float = 0

    def should_attempt(self) -> bool:
        """Check if solving should be attempted given circuit breaker state."""
        if self._circuit_state == CircuitState.CLOSED:
            return True
        if self._circuit_state == CircuitState.OPEN:
            if time.time() >= self._cooldown_until:
                self._circuit_state = CircuitState.HALF_OPEN
                return True
            return False
        return True

    def record(self, method: str, duration: float, success: bool):
        self._history.append((method, duration, success))
        if len(self._history) > 50:
            self._history.pop(0)

        if success:
            self._consecutive_failures = 0
            self._circuit_state = CircuitState.CLOSED
        else:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.FAILURE_THRESHOLD:
                self._circuit_state = CircuitState.OPEN
                self._cooldown_until = time.time() + self.COOLDOWN_SECONDS

    def best_method(self) -> str:
        """Return the method most likely to succeed fastest."""
        if len(self._history) < 3:
            return self.METHOD_TWO_PHASE

        scores: dict[str, float] = {}
        for method in self.METHOD_ALL:
            entries = [(d, s) for m, d, s in self._history if m == method]
            if not entries:
                continue
            success_rate = sum(1 for _, s in entries if s) / len(entries)
            avg_duration = sum(d for d, _ in entries) / len(entries)
            scores[method] = success_rate / max(avg_duration, 0.1)

        if not scores:
            return self.METHOD_TWO_PHASE
        return max(scores, key=scores.get)

    def summary(self) -> dict:
        counts = {}
        for method in self.METHOD_ALL:
            entries = [(d, s) for m, d, s in self._history if m == method]
            if entries:
                success_rate = sum(1 for _, s in entries if s) / len(entries)
                avg_dur = sum(d for d, _ in entries) / len(entries)
                counts[method] = {"count": len(entries), "success_rate": round(success_rate, 2), "avg_duration_s": round(avg_dur, 1)}
        return {
            "domain": self.domain,
            "methods": counts,
            "best": self.best_method(),
            "circuit": self._circuit_state.name.lower(),
            "consecutive_failures": self._consecutive_failures,
        }


class DomainRegistry:
    """Async-safe registry of per-domain solving profiles."""

    def __init__(self):
        self._profiles: dict[str, DomainProfile] = {}
        self._lock = asyncio.Lock()

    async def get(self, domain: str) -> DomainProfile:
        async with self._lock:
            if domain not in self._profiles:
                self._profiles[domain] = DomainProfile(domain)
            return self._profiles[domain]

    def all_summaries(self) -> list[dict]:
        return [p.summary() for p in self._profiles.values()]

    def clear(self):
        self._profiles.clear()


class BaseBypassEngine(abc.ABC):
    """Abstract base class for bypass engines"""
    
    def __init__(self, name: str):
        self.name = name
        self.start_time = time.time()

    @abc.abstractmethod
    async def fetch(self, url: str, **kwargs) -> BypassResult:
        """Execute a bypass fetch request"""
        pass

    @abc.abstractmethod
    async def warmup(self, domain: str) -> bool:
        """Pre-warm sessions for a domain"""
        pass

    @abc.abstractmethod
    def get_stats(self) -> Dict[str, Any]:
        """Get engine performance metrics"""
        return {
            "name": self.name,
            "uptime": time.time() - self.start_time
        }

    async def shutdown(self):
        """Optional cleanup logic"""
        pass
