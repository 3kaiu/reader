"""
CF Bypass Scraper - Powered by curl_cffi
Uses advanced TLS fingerprinting (JA3) to bypass modern Cloudflare protections.
"""
import asyncio
import logging
import os
from dataclasses import dataclass, field
from typing import Dict, Optional, Any
from urllib.parse import urlparse

from curl_cffi.requests import AsyncSession, Response, RequestsError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cf-bypass")

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Config:
    api_key: str = field(default_factory=lambda: os.getenv("CF_API_KEY", ""))
    request_timeout: int = field(default_factory=lambda: int(os.getenv("REQUEST_TIMEOUT", "90")))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    global_proxy: str = field(default_factory=lambda: os.getenv("GLOBAL_PROXY", ""))

config = Config()
logger.setLevel(config.log_level)

# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────

@dataclass
class FetchResult:
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    error: Optional[str] = None

# ─────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────

class BypassEngine:
    def __init__(self):
        self._sessions: Dict[str, AsyncSession] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()
        
    def _get_domain(self, url: str) -> str:
        return urlparse(url).netloc
    
    async def _get_lock(self, domain: str) -> asyncio.Lock:
        async with self._global_lock:
            if domain not in self._locks:
                self._locks[domain] = asyncio.Lock()
            return self._locks[domain]
            
    async def _get_session(self, url: str) -> AsyncSession:
        domain = self._get_domain(url)
        lock = await self._get_lock(domain)
        
        # Domain-specific impersonation
        impersonate_ver = "chrome120" # Default
        if "hetushu.com" in domain:
            impersonate_ver = "chrome100" # Older chrome sometimes passes better if newer is flagged
        elif "69shuba.com" in domain:
            impersonate_ver = "chrome100"

        async with lock:
            if domain not in self._sessions:
                # Create new session with strong browser fingerprint
                self._sessions[domain] = AsyncSession(
                    impersonate=impersonate_ver,
                    headers={
                        # Common headers, but let curl_cffi handle UA
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    }
                )
                # Store the impersonate version in the session for reference (monkey patch)
                self._sessions[domain].impersonate_ver = impersonate_ver
                logger.info(f"Created curl_cffi session for {domain} with {impersonate_ver}")
            return self._sessions[domain]

    async def fetch(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        body: Optional[str] = None,
        timeout: int = 0,
        proxy: Optional[str] = None,
    ) -> FetchResult:
        timeout = timeout or config.request_timeout
        domain = self._get_domain(url)
        
        try:
            session = await self._get_session(url)
            
            # Prepare kwargs
            kwargs = {
                "method": method,
                "url": url,
                "timeout": timeout,
            }
            
            # Merge default headers with custom headers
            if headers:
                # Filter out User-Agent to prevent mismatch with TLS fingerprint (impersonate="chrome120")
                # Cloudflare detects mismatch between TLS Client Hello and HTTP User-Agent
                filtered_headers = {k: v for k, v in headers.items() if k.lower() != "user-agent"}
                kwargs["headers"] = filtered_headers
            
            if body:
                kwargs["data"] = body
                
            
            if proxy:
                kwargs["proxies"] = {"http": proxy, "https": proxy}
            elif config.global_proxy:
                kwargs["proxies"] = {"http": config.global_proxy, "https": config.global_proxy}

            logger.info(f"Fetching {url}")
            
            # Execute request
            resp: Response = await session.request(**kwargs)
            
            logger.info(f"Done: status={resp.status_code}")
            
            # Detect Cloudflare Challenge (generic check)
            if resp.status_code in [403, 503]:
                 # Check for CF specific text
                 if "Just a moment" in resp.text or "challenge-platform" in resp.text:
                     logger.warning(f"Hit Cloudflare challenge: {resp.status_code}. Resetting session.")
                     # Invalidating session to force fresh handshake next time
                     lock = await self._get_lock(domain)
                     async with lock:
                        if domain in self._sessions:
                            await self._sessions[domain].close()
                            del self._sessions[domain]

                     return FetchResult(
                        status=resp.status_code,
                        html=resp.text,
                        cookies=resp.cookies, # curl_cffi cookies are dict-like
                        headers=dict(resp.headers),
                        cf_bypassed=False,
                        error="Cloudflare challenge detected (403/503)"
                    )


            # Detect encoding for GBK sites (like 69shuba)
            content = resp.content
            charset = "utf-8"
            
            # Simple heuristic for GBK
            # curl_cffi/requests might default to ISO-8859-1 or UTF-8
            lower_content = content[:2000].lower() # Check first 2KB
            if b"charset=gbk" in lower_content or b'charset="gbk"' in lower_content or b"charset='gbk'" in lower_content:
                charset = "gbk"
            elif b"charset=gb2312" in lower_content or b'charset="gb2312"' in lower_content:
                charset = "gb18030" # Superset of GB2312/GBK
            
            try:
                html = content.decode(charset)
            except Exception:
                # Fallback to auto-detection or replacement
                try:
                    if hasattr(resp, "charset") and resp.charset:
                         html = content.decode(resp.charset)
                    elif hasattr(resp, "encoding") and resp.encoding:
                         html = content.decode(resp.encoding)
                    else:
                         html = content.decode("utf-8", errors="replace")
                except:
                    html = content.decode("utf-8", errors="replace")

            return FetchResult(
                status=resp.status_code,
                html=html,
                cookies=resp.cookies,
                headers=dict(resp.headers),
                cf_bypassed=True
            )
            
        except RequestsError as e:
            logger.error(f"Request error: {e}")
            return FetchResult(
                status=500,
                html="",
                cookies={},
                headers={},
                cf_bypassed=False,
                error=f"Network Error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return FetchResult(
                status=500,
                html="",
                cookies={},
                headers={},
                cf_bypassed=False,
                error=f"Internal Error: {str(e)}"
            )

    def get_cached_tokens(self, url: str) -> Optional[Dict]:
        """Expose cookie/UA for compatibility with app.py endpoint"""
        domain = self._get_domain(url)
        if domain in self._sessions:
            session = self._sessions[domain]
            return {
                "cookies": session.cookies,
                "user_agent": session.headers.get("User-Agent", "curl_cffi/chrome120")
            }
        return None

    def get_stats(self) -> Dict:
        return {
            "active_sessions": len(self._sessions),
            "domains": list(self._sessions.keys()),
        }
    
    async def shutdown(self):
        for s in self._sessions.values():
            s.close() # Sync close is fine? AsyncSession might need async close
            # curl_cffi async session close is awaitable?
            # It seems AsyncSession context manager handles it. 
            pass
        self._sessions.clear()
        logger.info("Engine shutdown")

# Singleton
engine = BypassEngine()
