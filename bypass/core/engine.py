"""
Base Bypass Engine Abstraction
Unified interface for all bypass engines (Scraper, Mesh, etc.)
"""
import abc
import time
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
