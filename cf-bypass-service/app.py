"""
CF Bypass Service - FastAPI Application
Enhanced with CloudScraper v5.0 - maximizing built-in anti-detection features.
"""
import logging
from datetime import datetime
from typing import Optional, Dict

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

# Import new CloudScraper wrapper instead of old curl_cffi engine
from cloudscraper_wrapper import wrapper as engine, FetchResult
import os

# Configuration (maintain compatibility)
class Config:
    def __init__(self):
        self.api_key = os.getenv("CF_API_KEY", "")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")

config = Config()

logging.basicConfig(level=config.log_level)
logger = logging.getLogger("cf-bypass")

app = FastAPI(
    title="CF Bypass Service",
    version="5.0.0",
    description="Cloudflare bypass using CloudScraper with maximum built-in features + caching + monitoring",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────

class FetchRequest(BaseModel):
    url: HttpUrl
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    timeout: int = 30
    proxy: Optional[str] = None
    body: Optional[str] = None


class FetchResponse(BaseModel):
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    error: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Lifecycle
# ─────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    logger.info("CF Bypass Service v5.0 started (CloudScraper + Redis Cache + Monitoring)")


@app.on_event("shutdown")
async def shutdown():
    await engine.shutdown()


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    stats = engine.get_stats()
    return {
        "status": "healthy",
        "version": "5.0.0",
        "timestamp": datetime.now().isoformat(),
        "active_sessions": stats["active_sessions"],
        "engine": stats.get("engine", "CloudScraper"),
        "cache_available": stats.get("cache_available", False),
    }


@app.post("/fetch", response_model=FetchResponse)
async def fetch(request: FetchRequest, x_api_key: str = Header(None)):
    """Fetch URL with CloudScraper's built-in Cloudflare bypass (v1/v2/v3 + Turnstile)."""
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    # Use new CloudScraper wrapper - interface remains identical
    result = await engine.fetch(
        url=str(request.url),
        method=request.method,
        headers=request.headers,
        body=request.body,
        timeout=request.timeout,
        proxy=request.proxy,
    )
    
    if result.error:
        raise HTTPException(status_code=500, detail=result.error)
    
    # Response format remains completely unchanged for backward compatibility
    return FetchResponse(
        status=result.status,
        html=result.html,
        cookies=result.cookies,
        headers=result.headers,
        cf_bypassed=result.cf_bypassed,
    )


@app.get("/tokens")
async def get_tokens(domain: str):
    """Get cached tokens for domain."""
    tokens = engine.get_cached_tokens(f"https://{domain}")
    if tokens:
        return {"source": "cache", **tokens}
    return {"source": "none", "cookies": {}, "user_agent": ""}


@app.get("/stats")
async def stats():
    """Engine statistics."""
    return engine.get_stats()
