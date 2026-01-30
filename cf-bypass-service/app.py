"""
CF Bypass Service - FastAPI Application
Standardized with unified Bypass Engines (Scraper & Mesh).
"""
import logging
import os
from datetime import datetime
from typing import Optional, Dict, List
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from contextlib import asynccontextmanager

from core.engine_factory import factory as engine_factory
from phase2_config import phase2_config

# Configuration
class Config:
    def __init__(self):
        self.api_key = os.getenv("CF_API_KEY", "")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")

config = Config()
logging.basicConfig(level=config.log_level)
logger = logging.getLogger("cf-bypass")

# Models
class FetchRequest(BaseModel):
    url: HttpUrl
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    timeout: int = 30
    proxy: Optional[str] = None
    body: Optional[str] = None
    engine: Optional[str] = None

class BatchFetchRequest(BaseModel):
    urls: List[HttpUrl]
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
    cached: bool = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("CF Bypass Service started with Standardized Engines")
    yield
    await engine_factory.shutdown_all()

app = FastAPI(
    title="CF Bypass Service",
    version="6.0.0",
    description="Unified CF Bypass Service with Standardized Engine Architecture",
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
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
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

@app.get("/stats")
async def stats(engine_name: Optional[str] = None):
    """Aggregate or specific engine statistics."""
    if engine_name:
        return engine_factory.get_engine(name=engine_name).get_stats()
    
    # Return summary of all active engines
    all_stats = {}
    for name, engine in engine_factory._engines.items():
        all_stats[name] = engine.get_stats()
    return all_stats

@app.post("/warmup")
async def warmup(domain: str, engine_name: Optional[str] = None, x_api_key: str = Header(None)):
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    engine = engine_factory.get_engine(name=engine_name, domain=domain)
    success = await engine.warmup(domain)
    return {"success": success, "domain": domain, "engine": engine.name}

# Simplified Batch Fetch
@app.post("/fetch/batch", response_model=List[FetchResponse])
async def fetch_batch(request: BatchFetchRequest, x_api_key: str = Header(None)):
    if config.api_key and x_api_key != config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    urls = [str(u) for u in request.urls]
    domain = urlparse(urls[0]).netloc if urls else ""
    engine = engine_factory.get_engine(name=request.engine, domain=domain)
    
    # Generic loop if engine doesn't support native batch
    results = []
    for url in urls:
        res = await engine.fetch(url, method=request.method, headers=request.headers)
        results.append(FetchResponse(
            status=res.status,
            html=res.html,
            cookies=res.cookies,
            headers=res.headers,
            cf_bypassed=res.cf_bypassed,
            error=res.error,
            engine_used=res.engine,
            cached=res.cached
        ))
    return results

# Basic Config Endpoint
@app.get("/config")
async def get_config():
    return {
        "phase2": phase2_config.to_dict(),
        "version": "6.0.0"
    }
