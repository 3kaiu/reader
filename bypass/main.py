"""
CF Bypass Service - FastAPI Application
Focused infrastructure service for fetching target HTML via bypass engines.
"""
import logging
import os
import asyncio
import time
import hmac
from collections import defaultdict
from datetime import datetime
from typing import Optional, Dict
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl, field_validator
from contextlib import asynccontextmanager

from core.engine_factory import factory as engine_factory
from core.utils import validate_url_not_private
from engines.browser_probe import is_cf_blocked

# Configuration
class Config:
    def __init__(self):
        self.api_key = os.getenv("CF_API_KEY", "")
        if not self.api_key:
            logging.getLogger(__name__).warning(
                "CF_API_KEY environment variable is not set. "
                "All bypass endpoints (fetch, browser-probe, solve-cf) will reject requests."
            )
            # Don't raise — allow the app to start for testing purposes.
            # The validate_api_key dependency will reject unauthenticated requests at runtime.
            self._enforce_auth = bool(self.api_key)
        else:
            self._enforce_auth = True
        self.log_level = os.getenv("LOG_LEVEL", "INFO")

_config: Optional[Config] = None

def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
    return _config
logging.basicConfig(level=get_config().log_level)
logger = logging.getLogger("cf-bypass")
MAX_CONCURRENCY = max(1, int(os.getenv("BYPASS_MAX_CONCURRENCY", "20")))
MAX_PER_DOMAIN = max(1, int(os.getenv("BYPASS_MAX_PER_DOMAIN", "3")))
# Global semaphore across all domains
FETCH_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENCY)
# Per-domain semaphores to prevent one slow domain from starving others.
# Cleaned periodically to prevent unbounded growth from ephemeral domains.
_DOMAIN_SEMAPHORES: dict[str, asyncio.Semaphore] = {}
_DOMAIN_SEMAPHORE_LOCK = asyncio.Lock()
_MAX_DOMAIN_SEMAPHORE_ENTRIES = 500

async def acquire_domain_semaphore(domain: str):
    """Acquire a per-domain semaphore (max MAX_PER_DOMAIN concurrent per domain)."""
    global _DOMAIN_SEMAPHORES
    async with _DOMAIN_SEMAPHORE_LOCK:
        if domain not in _DOMAIN_SEMAPHORES:
            # Evict oldest entries when cache grows too large
            if len(_DOMAIN_SEMAPHORES) >= _MAX_DOMAIN_SEMAPHORE_ENTRIES:
                to_remove = list(_DOMAIN_SEMAPHORES.keys())[:50]
                for k in to_remove:
                    del _DOMAIN_SEMAPHORES[k]
                logger.warning(f"domain_semaphores: evicted {len(to_remove)} stale entries (size={len(_DOMAIN_SEMAPHORES)})")
            _DOMAIN_SEMAPHORES[domain] = asyncio.Semaphore(MAX_PER_DOMAIN)
    sem = _DOMAIN_SEMAPHORES[domain]
    await sem.acquire()
    return sem

async def release_domain_semaphore(sem: asyncio.Semaphore):
    """Release a previously acquired per-domain semaphore."""
    if sem:
        sem.release()

# Helper function for API key validation
def validate_api_key(x_api_key: str = Header(None)):
    key = get_config().api_key
    if not key:
        raise HTTPException(status_code=503, detail="Service not configured: API key not set")
    if not hmac.compare_digest(x_api_key or "", key):
        raise HTTPException(status_code=401, detail="Invalid API Key")

# Models
ALLOWED_HTTP_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}

class FetchRequest(BaseModel):
    url: HttpUrl
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    timeout: int = 30
    proxy: Optional[str] = None
    body: Optional[str] = None
    engine: Optional[str] = None

    @field_validator("method", mode="before")
    @classmethod
    def validate_method(cls, v: str) -> str:
        method = v.upper()
        if method not in ALLOWED_HTTP_METHODS:
            raise ValueError(f"Invalid HTTP method: {v}. Allowed: {', '.join(sorted(ALLOWED_HTTP_METHODS))}")
        return method

    @field_validator("url", mode="before")
    @classmethod
    def validate_url_not_private(cls, v: str) -> str:
        return validate_url_not_private(v)

    @field_validator("proxy", mode="before")
    @classmethod
    def validate_proxy_not_private(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return validate_url_not_private(v)

    @field_validator("body")
    @classmethod
    def limit_body_size(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v) > 10_000_000:
            raise ValueError("body exceeds maximum length of 10,000,000 characters")
        return v

    @field_validator("timeout")
    @classmethod
    def limit_timeout(cls, v: int) -> int:
        if v > 120:
            raise ValueError("timeout must be <= 120 seconds")
        return v

class FetchResponse(BaseModel):
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    error: Optional[str] = None
    engine_used: str = ""
    cached: bool = False

class BrowserProbeRequest(BaseModel):
    url: HttpUrl
    js_code: Optional[str] = None
    wait_until: str = "load"
    timeout_ms: int = 30000
    visible: bool = False
    poll_cf: bool = False  # if true, run ensureCfPassed flow

    @field_validator("wait_until")
    @classmethod
    def validate_wait_until(cls, v: str) -> str:
        allowed = {"load", "domcontentloaded", "networkidle", "commit"}
        if v not in allowed:
            raise ValueError(f"Invalid wait_until: {v}. Allowed: {', '.join(sorted(allowed))}")
        return v

    @field_validator("url", mode="before")
    @classmethod
    def validate_url_not_private(cls, v: str) -> str:
        return validate_url_not_private(v)

    @field_validator("js_code")
    @classmethod
    def limit_js_code(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v) > 50_000:
            raise ValueError("js_code exceeds maximum length of 50,000 characters")
        return v

    @field_validator("timeout_ms")
    @classmethod
    def limit_timeout_ms(cls, v: int) -> int:
        if v > 120_000:
            raise ValueError("timeout_ms must be <= 120000 (120s)")
        return v

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("CF Bypass Service started")

    yield
    await engine_factory.shutdown_all()

app = FastAPI(
    title="CF Bypass Service",
    version="6.0.0",
    description="Minimal infrastructure service that returns fetched HTML payloads.",
    lifespan=lifespan
)

# CORS: restrict to the HTTP methods and headers actually used by this service.
# - Methods: GET (/health, /api/adaptive-stats) and POST (/fetch, /api/browser-probe,
#   /api/solve-cf). OPTIONS is required for CORS preflight.
# - Headers: Content-Type (JSON request bodies) and X-API-Key (authentication).
#   Avoiding "*" prevents clients from sending arbitrary headers cross-origin.
# Allow origins can be overridden via BYPASS_CORS_ORIGINS (comma-separated).
_bypass_cors_origins = [
    o.strip()
    for o in os.getenv(
        "BYPASS_CORS_ORIGINS",
        "http://localhost:5173,http://localhost:4173,"
        "https://nexus.pages.dev,https://nexus-reader.pages.dev",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_bypass_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# Standardize error responses to match Nexus error protocol
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": f"HTTP_{exc.status_code}",
            "message": exc.detail,
            "requestId": request.headers.get("x-request-id"),
        },
    )

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
    }

@app.post("/fetch", response_model=FetchResponse)
async def fetch(request: FetchRequest, x_api_key: str = Header(None)):
    validate_api_key(x_api_key)
    url_str = str(request.url)
    domain = urlparse(url_str).netloc

    domain_sem = await acquire_domain_semaphore(domain)
    try:
        async with FETCH_SEMAPHORE:
            engine = engine_factory.get_engine(name=request.engine, domain=domain)
            result = await engine.fetch(
                url=url_str,
                method=request.method,
                headers=request.headers,
                body=request.body,
                timeout=request.timeout,
                proxy=request.proxy,
            )
    finally:
        release_domain_semaphore(domain_sem)

    return FetchResponse(
        status=result.status,
        html=result.html,
        cookies=result.cookies,
        headers=result.headers,
        cf_bypassed=result.cf_bypassed,
        error=result.error,
        engine_used=result.engine,
        cached=result.cached
    )


@app.post("/api/browser-probe")
async def browser_probe(request: BrowserProbeRequest, x_api_key: str = Header(None)):
    """Browser probe endpoint: navigate, execute JS, or complete CF challenges."""
    validate_api_key(x_api_key)
    url_str = str(request.url)

    engine = engine_factory.get_engine(name="browser-probe")

    if request.poll_cf:
        # Full CF ensure-passed flow
        result = await engine.ensure_cf_passed(
            url=url_str,
            original_html="",
            max_attempts=60,
        )
    elif request.js_code:
        # One-shot JS execution
        result = await engine.run_js_and_return_html(
            url=url_str,
            js_code=request.js_code,
            visible=request.visible,
            wait_until=request.wait_until,
            timeout_ms=request.timeout_ms,
        )
    else:
        # Simple navigation + return HTML
        session_id = await engine.acquire_session(visible=request.visible)
        try:
            nav_result = await engine.navigate(session_id, url_str, request.wait_until, request.timeout_ms)
            cookies = await engine.get_cookies(session_id)
            cookie_dict = {c["name"]: c["value"] for c in cookies}
            return {
                "status": 200,
                "html": nav_result["html"],
                "cookies": cookie_dict,
                "cf_bypassed": not is_cf_blocked(nav_result["html"]),
                "title": nav_result["title"],
                "final_url": nav_result["url"],
            }
        finally:
            await engine.release_session(session_id)

    return {
        "status": result.status,
        "html": result.html,
        "cookies": result.cookies,
        "cf_bypassed": result.cf_bypassed,
        "error": result.error,
    }


class SolveCFRequest(BaseModel):
    url: HttpUrl
    timeout_ms: int = 30000

    @field_validator("url", mode="before")
    @classmethod
    def validate_url_not_private(cls, v: str) -> str:
        return validate_url_not_private(str(v))

    @field_validator("timeout_ms")
    @classmethod
    def limit_timeout_ms(cls, v: int) -> int:
        if v > 120_000:
            raise ValueError("timeout_ms must be <= 120000 (120s)")
        return v


@app.get("/api/adaptive-stats")
async def adaptive_stats(x_api_key: str = Header(None)):
    """Get per-domain adaptive solving statistics."""
    validate_api_key(x_api_key)
    return {
        "domains": engine_factory.domain_registry.all_summaries(),
        "engine_stats": engine_factory.get_active_stats(),
    }


@app.post("/api/solve-cf")
async def solve_cf(request: SolveCFRequest, x_api_key: str = Header(None)):
    """Auto-solve CF Turnstile challenges using headless browser.
    
    Returns:
      ok: bool — whether CF was cleared
      html: str — page HTML after CF
      cookies: dict — cookies from the session (including cf_clearance)
    """
    validate_api_key(x_api_key)
    engine = engine_factory.get_engine(name="browser-probe")
    try:
        result = await asyncio.wait_for(
            engine.solve_cf(url=request.url, timeout_ms=request.timeout_ms),
            timeout=(request.timeout_ms / 1000) + 10,
        )
        return result
    except asyncio.TimeoutError:
        return {
            "ok": False,
            "html": "",
            "cookies": {},
            "error": "Total solve timeout exceeded",
        }
