"""
CF Bypass Service - FastAPI Application
Enhanced with CloudScraper v5.0 - maximizing built-in anti-detection features.
"""
import logging
from datetime import datetime
from typing import Optional, Dict
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from contextlib import asynccontextmanager

# Import Engine Factory
from core.engine_factory import factory as engine_factory
from enhanced_cf_bypass import get_domain_stats, shutdown_bypass
from phase2_config import phase2_config
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
    description="Unified CF Bypass Service with Dynamic Engine Selection",
    lifespan=lifespan
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
    engine: Optional[str] = None # Allow client to suggest engine


class BatchFetchRequest(BaseModel):
    urls: list[HttpUrl]
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    timeout: int = 30
    proxy: Optional[str] = None
    engine: Optional[str] = None


class FetchResponse(BaseModel):
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    error: Optional[str] = None
    engine_used: str = ""


# ─────────────────────────────────────────────────────────────
# Lifecycle
# ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("CF Bypass Service v5.0 started with Dynamic Engine Selection")
    yield
    # Shutdown
    await shutdown_bypass()

app = FastAPI(
    title="CF Bypass Service",
    version="5.0.0",
    description="Unified CF Bypass Service with Dynamic Engine Selection",
    lifespan=lifespan
)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "5.0.0",
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/fetch", response_model=FetchResponse)
async def fetch(request: FetchRequest, x_api_key: str = Header(None)):
    """Fetch URL with dynamic engine selection (CloudScraper or Mesh)."""
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    # Get engine from factory
    domain = urlparse(str(request.url)).netloc if request.url else ""
    engine = engine_factory.get_engine(name=request.engine, domain=domain)
    
    result = await engine.fetch(
        url=str(request.url),
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
        error=getattr(result, 'error', None),
        engine_used=getattr(result, 'method_used', 'unknown')
    )


@app.get("/tokens")
async def get_tokens(domain: str):
    """Get cached tokens for domain."""
    engine = engine_factory.get_engine(domain=domain)
    tokens = engine.get_cached_tokens(f"https://{domain}")
    if tokens:
        return {"source": "cache", **tokens}
    return {"source": "none", "cookies": {}, "user_agent": ""}


@app.get("/stats")
async def stats():
    """Engine statistics including performance metrics."""
    # This might need to aggregate stats from multiple engines or return default
    engine = engine_factory.get_engine()
    return engine.get_stats()


@app.get("/stats/domains")
async def domains_stats():
    """Detailed Cloudflare protection stats for all domains."""
    return get_domain_stats()


@app.post("/fetch/parallel")
async def fetch_parallel(requests: list[FetchRequest], x_api_key: str = Header(None)):
    """
    Fetch multiple URLs in parallel for improved throughput.
    Expected improvement: 50-70% faster than sequential requests.
    """
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    # Convert to dict format
    request_dicts = [
        {
            'url': str(req.url),
            'method': req.method,
            'headers': req.headers,
            'body': req.body,
            'timeout': req.timeout,
            'proxy': req.proxy
        }
        for req in requests
    ]
    
    # Use mesh engine for parallel fetching as it handles it better
    engine = engine_factory.get_engine("mesh")
    results = await engine.fetch_parallel(request_dicts)
    
    # Convert results to response format
    return [
        FetchResponse(
            status=result.status,
            html=result.html,
            cookies=result.cookies,
            headers=result.headers,
            cf_bypassed=result.cf_bypassed,
            error=getattr(result, 'error', None),
            engine_used=getattr(result, 'method_used', 'mesh')
        )
        for result in results
    ]


@app.post("/fetch/batch")
async def fetch_batch(request: BatchFetchRequest, x_api_key: str = Header(None)):
    """
    Batch fetch multiple URLs with common parameters.
    Optimized for same-domain requests with 60-75% improvement.
    """
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    # Convert URLs to strings
    urls = [str(url) for url in request.urls]
    domain = urlparse(urls[0]).netloc if urls else ""
    engine = engine_factory.get_engine(name=request.engine, domain=domain)
    
    results = await engine.fetch_batch(
        urls,
        method=request.method,
        headers=request.headers,
        timeout=request.timeout,
        proxy=request.proxy
    )
    
    # Convert results to response format
    return [
        FetchResponse(
            status=result.status,
            html=result.html,
            cookies=result.cookies,
            headers=result.headers,
            cf_bypassed=result.cf_bypassed,
            error=getattr(result, 'error', None),
            engine_used=getattr(result, 'method_used', 'unknown')
        )
        for result in results
    ]


@app.get("/config")
async def get_config():
    """Get current Phase 2 configuration."""
    return {
        "phase2": phase2_config.to_dict(),
        "version": "5.0.0"
    }


@app.post("/warmup")
async def warmup(domain: str, x_api_key: str = Header(None)):
    """
    Warmup session pool for a domain.
    Pre-creates sessions to eliminate cold start latency.
    Expected improvement: 70-80% faster first request.
    """
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    engine = engine_factory.get_engine(domain=domain)
    result = await engine.warmup_domain(domain)
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Warmup failed"))
    
    return result


@app.post("/recover")
async def recover(domain: str, x_api_key: str = Header(None)):
    """
    Manually trigger recovery for a domain.
    Resets all sessions and clears session pool for the specified domain.
    Useful for forcing recovery without waiting for auto-recovery.
    """
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    # Get engine
    engine = engine_factory.get_engine(domain=domain)
    
    # Check if enhanced health monitoring is enabled
    if not phase2_config.health_monitoring_enabled:
        raise HTTPException(
            status_code=400, 
            detail="Health monitoring is not enabled. Cannot perform manual recovery."
        )
    
    # For OptimizedCFBypass (mesh), health_monitor is hidden in orchestrator or directly available
    # In enhanced_cf_bypass.py, health stats are managed by orchestrator or health_monitor
    health_monitor = getattr(engine, 'health_monitor', None)
    
    # Check if health monitor has the required methods
    if not health_monitor or not hasattr(health_monitor, 'reset_domain_stats'):
        raise HTTPException(
            status_code=400,
            detail="Enhanced health monitor is not available for this engine. Cannot perform manual recovery."
        )
    
    try:
        # Get health status before recovery
        health_before = health_monitor.get_health_stats(domain)
        
        # Perform recovery actions
        logger.info(f"Manual recovery triggered for domain: {domain}")
        
        # Reset all sessions for the domain
        if hasattr(engine, 'scrapers') and domain in engine.scrapers:
            del engine.scrapers[domain]
            logger.info(f"Removed session for domain: {domain}")
        
        # Reset session pool for the domain if pool is enabled
        session_pool_manager = getattr(engine, 'session_pool_manager', None)
        if session_pool_manager:
            await session_pool_manager.clear_pool(domain)
        
        # Reset health stats for the domain
        health_monitor.reset_domain_stats(domain)
        
        # Get health status after recovery
        health_after = health_monitor.get_health_stats(domain)
        
        return {
            "success": True,
            "domain": domain,
            "message": f"Recovery completed for {domain}",
            "health_before": health_before,
            "health_after": health_after,
            "actions_taken": [
                action for action in [
                    "Reset domain sessions",
                    "Cleared session pool" if session_pool_manager else None,
                    "Reset health statistics"
                ] if action is not None
            ]
        }
        
    except Exception as e:
        logger.error(f"Manual recovery failed for {domain}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Recovery failed: {str(e)}"
        )
