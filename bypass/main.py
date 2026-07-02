"""
CF Bypass Service - FastAPI Application
Focused infrastructure service for fetching target HTML via bypass engines.
"""
import logging
import os
import asyncio
from datetime import datetime
from typing import Optional, Dict
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from contextlib import asynccontextmanager

from core.engine_factory import factory as engine_factory

# Configuration
class Config:
    def __init__(self):
        self.api_key = os.getenv("CF_API_KEY", "")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")

config = Config()
logging.basicConfig(level=config.log_level)
logger = logging.getLogger("cf-bypass")
MAX_CONCURRENCY = max(1, int(os.getenv("BYPASS_MAX_CONCURRENCY", "20")))
FETCH_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENCY)

# Helper function for API key validation
def validate_api_key(x_api_key: str = Header(None)):
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")

# Models
class FetchRequest(BaseModel):
    url: HttpUrl
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    timeout: int = 30
    proxy: Optional[str] = None
    body: Optional[str] = None
    engine: Optional[str] = None

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    async with FETCH_SEMAPHORE:
        url_str = str(request.url)
        domain = urlparse(url_str).netloc
        engine = engine_factory.get_engine(name=request.engine, domain=domain)
        
        result = await engine.fetch(
            url=url_str,
            method=request.method,
            headers=request.headers,
            body=request.body,
            timeout=request.timeout,
            proxy=request.proxy,
        )
    
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
