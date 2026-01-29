"""
Bypass Protocol - Ensuring consistent interface for all bypass engines
"""
from typing import Dict, Optional, Any, Protocol, runtime_checkable
from dataclasses import dataclass

@dataclass
class FetchResult:
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    method_used: str
    duration: float
    error: Optional[str] = None

@runtime_checkable
class BypassEngine(Protocol):
    async def fetch(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        body: Optional[str] = None,
        timeout: int = 30,
        proxy: Optional[str] = None,
    ) -> FetchResult:
        ...

    def get_stats(self) -> Dict[str, Any]:
        ...
