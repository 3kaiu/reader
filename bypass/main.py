"""
CF Bypass Service - FastAPI Application
Focused infrastructure service for fetching target HTML via bypass engines.
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
import trafilatura

from core.engine_factory import factory as engine_factory
from config import phase2_config

def is_true_flag(value: Optional[str]) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}

# Configuration
class Config:
    def __init__(self):
        self.api_key = os.getenv("CF_API_KEY", "")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        self.admin_endpoints_enabled = is_true_flag(os.getenv("ENABLE_ADMIN_ENDPOINTS", "false"))

config = Config()
logging.basicConfig(level=config.log_level)
logger = logging.getLogger("cf-bypass")

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

class ExtractRequest(BaseModel):
    html: str
    url: Optional[HttpUrl] = None
    favor_precision: bool = True
    favor_recall: bool = False
    include_comments: bool = False
    include_tables: bool = False

class ExtractResponse(BaseModel):
    text: str
    title: Optional[str] = None
    excerpt: Optional[str] = None
    char_count: int = 0
    paragraph_count: int = 0
    extractor: str = "trafilatura"
    warnings: List[str] = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("CF Bypass Service started")
    
    # Auto-warmup on startup
    if phase2_config.session_pool_enabled and phase2_config.warmup_domains:
        logger.info(f"Triggering auto-warmup for: {phase2_config.warmup_domains}")
        for domain in phase2_config.warmup_domains:
            engine = engine_factory.get_engine(domain=domain)
            # Run warmup in background to not block startup
            import asyncio
            asyncio.create_task(engine.warmup(domain))
            
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
async def stats(engine_name: Optional[str] = None, x_api_key: str = Header(None)):
    """Aggregate or specific engine statistics."""
    if not config.admin_endpoints_enabled:
        raise HTTPException(status_code=404, detail="Not Found")
    validate_api_key(x_api_key)

    if engine_name:
        return engine_factory.get_engine(name=engine_name).get_stats()
    
    return engine_factory.get_active_stats()

@app.post("/warmup")
async def warmup(domain: str, engine_name: Optional[str] = None, x_api_key: str = Header(None)):
    validate_api_key(x_api_key)
    
    engine = engine_factory.get_engine(name=engine_name, domain=domain)
    success = await engine.warmup(domain)
    return {"success": success, "domain": domain, "engine": engine.name}

# Simplified Batch Fetch
@app.post("/fetch/batch", response_model=List[FetchResponse])
async def fetch_batch(request: BatchFetchRequest, x_api_key: str = Header(None)):
    validate_api_key(x_api_key)
    
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

@app.post("/extract", response_model=ExtractResponse)
async def extract_content(request: ExtractRequest, x_api_key: str = Header(None)):
    validate_api_key(x_api_key)

    html = request.html or ""
    warnings: List[str] = []
    if not html.strip():
        warnings.append("empty_html")
        return ExtractResponse(warnings=warnings)

    try:
        document = trafilatura.extract(
            html,
            url=str(request.url) if request.url else None,
            favor_precision=request.favor_precision,
            favor_recall=request.favor_recall,
            include_comments=request.include_comments,
            include_tables=request.include_tables,
        ) or ""
    except Exception as exc:
        logger.warning("trafilatura extract failed: %s", exc)
        warnings.append("extract_failed")
        return ExtractResponse(warnings=warnings)

    title: Optional[str] = None
    excerpt: Optional[str] = None
    try:
        metadata = trafilatura.extract_metadata(html)
        if metadata:
            title = metadata.title or None
            excerpt = metadata.description or None
    except Exception as exc:
        logger.debug("trafilatura metadata extract failed: %s", exc)
        warnings.append("metadata_failed")

    normalized = "\n".join(
        line.strip()
        for line in document.splitlines()
        if line.strip()
    )
    paragraph_count = sum(1 for line in normalized.splitlines() if line.strip())

    if not normalized:
        warnings.append("empty_result")

    return ExtractResponse(
        text=normalized,
        title=title,
        excerpt=excerpt,
        char_count=len(normalized),
        paragraph_count=paragraph_count,
        warnings=warnings,
    )

# Basic Config Endpoint
@app.get("/config")
async def get_config(x_api_key: str = Header(None)):
    if not config.admin_endpoints_enabled:
        raise HTTPException(status_code=404, detail="Not Found")
    validate_api_key(x_api_key)

    return {
        "phase2": phase2_config.to_dict(),
        "version": "6.0.0",
        "admin_endpoints_enabled": config.admin_endpoints_enabled,
    }
