"""
Mesh Engine - Camoufox + CloudflareBypasser Integrated Implementation
Inherits from BaseBypassEngine for unified interface.
"""
import asyncio
import json
import os
import random
import time
from typing import Optional, Dict, List, Tuple, Any
from pathlib import Path
from urllib.parse import urlparse

from core.engine import BaseBypassEngine, BypassResult
from core.utils import EnhancedLogger

# Use EnhancedLogger
enhanced_logger = EnhancedLogger("mesh-engine")
logger = enhanced_logger.logger

# Persistent storage path
DATA_DIR = Path(os.getenv("CF_DATA_DIR", "data"))
STATS_FILE = DATA_DIR / "mesh_stats.json"

class MeshSession:
    """Integrated session state shared across tools"""
    def __init__(self, domain: str, cookies: Dict = None, ua: str = "", last_updated: float = 0.0):
        self.domain = domain
        self.cookies = cookies or {}
        self.ua = ua
        self.last_updated = last_updated
        self.protection_level = "unknown"
        self.success_count = 0
        self.fail_count = 0

class MeshOrchestrator:
    """Manages the lifecycle and state of "The Mesh" instances"""
    def __init__(self):
        self._sessions: Dict[str, MeshSession] = {}
        self._load_stats()

    def _load_stats(self):
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            if STATS_FILE.exists():
                with open(STATS_FILE, 'r') as f:
                    data = json.load(f)
                    for domain, d in data.items():
                        self._sessions[domain] = MeshSession(
                            domain=domain,
                            cookies=d.get('cookies', {}),
                            ua=d.get('ua', ""),
                            last_updated=d.get('last_updated', 0.0)
                        )
        except Exception as e: logger.warning(f"Failed to load mesh stats: {e}")

    def save_stats(self):
        try:
            data = {d: {
                "cookies": s.cookies,
                "ua": s.ua,
                "last_updated": s.last_updated,
                "protection_level": s.protection_level,
                "success_count": s.success_count
            } for d, s in self._sessions.items()}
            with open(STATS_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception: pass

    def get_session(self, domain: str) -> MeshSession:
        if domain not in self._sessions:
            self._sessions[domain] = MeshSession(domain=domain)
        return self._sessions[domain]

class MeshEngine(BaseBypassEngine):
    """The Mesh: Integrated Hybrid Solver & Fetcher Implementation"""
    
    def __init__(self):
        super().__init__("mesh")
        self.orchestrator = MeshOrchestrator()
        self._browser = None
        self._browser_lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(15) 
        self._warm_contexts: Dict[str, Tuple[Any, float]] = {}

    async def _ensure_browser(self):
        if self._browser: return
        async with self._browser_lock:
            if self._browser: return
            try:
                from camoufox.async_api import AsyncCamoufox
                logger.info("MeshEngine: Initializing Camoufox Engine")
                self._browser = await AsyncCamoufox(headless=True).start()
            except Exception as e:
                logger.error(f"Failed to start Mesh Browser: {e}")
                raise

    async def _get_context(self, domain: str):
        await self._ensure_browser()
        tld = ".".join(domain.split('.')[-2:])
        now = time.time()
        
        # Cleanup expired (30m)
        expired = [t for t, (_, last_used) in self._warm_contexts.items() if now - last_used > 1800]
        for t in expired:
            try:
                ctx, _ = self._warm_contexts.pop(t)
                await ctx.close()
            except Exception: pass

        if tld not in self._warm_contexts:
            ctx = await self._browser.new_context()
            self._warm_contexts[tld] = (ctx, now)
        else:
            ctx, _ = self._warm_contexts[tld]
            self._warm_contexts[tld] = (ctx, now)
        return ctx

    async def _integrated_mesh_solver(self, url: str, timeout: int) -> Tuple[bool, Dict, str]:
        domain = urlparse(url).netloc
        ctx = await self._get_context(domain)
        page = await ctx.new_page()
        try:
            from CloudflareBypasser import CloudflareBypasser
            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=timeout * 1000)
            except Exception: pass

            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            bypasser = CloudflareBypasser(page)
            await bypasser.bypass()
            
            await asyncio.sleep(2)
            html = await page.content()
            if any(x in html.lower() for x in ['just a moment', 'checking your browser', 'cf-turnstile']):
                await page.mouse.wheel(0, 500)
                await asyncio.sleep(2)
                html = await page.content()
                if any(x in html.lower() for x in ['just a moment', 'checking your browser']):
                    return False, {}, ""

            cookies_list = await ctx.cookies()
            cookies = {c['name']: c['value'] for c in cookies_list}
            ua = await page.evaluate("navigator.userAgent")
            return True, cookies, ua
        except Exception as e:
            logger.debug(f"Mesh Solver error: {e}")
            return False, {}, ""
        finally:
            await page.close()

    async def _mesh_fetch_executor(self, url: str, timeout: int, cookies: Dict[str, str], ua: str) -> Optional[BypassResult]:
        try:
            from curl_cffi import requests as curl_requests
            start = time.time()
            impersonate = "chrome120"
            if "Firefox" in ua: impersonate = "safari15_5"
            
            resp = curl_requests.get(
                url, impersonate=impersonate, timeout=timeout,
                cookies=cookies, headers={"User-Agent": ua, "Accept": "text/html*"}
            )
            
            if resp.status_code == 200 and 'just a moment' not in resp.text.lower():
                return BypassResult(
                    status=200, html=resp.text, cookies=dict(resp.cookies),
                    headers=dict(resp.headers), cf_bypassed=True,
                    duration=time.time() - start, engine=self.name
                )
            return None
        except Exception: return None

    async def fetch(self, url: str, timeout: int = 40, **kwargs) -> BypassResult:
        domain = urlparse(url).netloc
        session = self.orchestrator.get_session(domain)
        start_time = time.time()

        if session.cookies and (time.time() - session.last_updated) < 900:
            result = await self._mesh_fetch_executor(url, 20, session.cookies, session.ua)
            if result: 
                result.cached = True
                return result

        async with self._semaphore:
            success, new_cookies, new_ua = await self._integrated_mesh_solver(url, timeout)
            if success:
                result = await self._mesh_fetch_executor(url, timeout, new_cookies, new_ua)
                if result:
                    session.cookies.update(new_cookies)
                    session.ua = new_ua
                    session.last_updated = time.time()
                    session.success_count += 1
                    session.protection_level = "solved_mesh"
                    self.orchestrator.save_stats()
                    result.duration = time.time() - start_time
                    return result

        return BypassResult(
            status=403, html="", cf_bypassed=False,
            error="The Mesh could not resolve the challenge",
            duration=time.time() - start_time, engine=self.name
        )

    async def warmup(self, domain: str) -> bool:
        try:
            await self._get_context(domain)
            return True
        except Exception:
            return False

    def get_stats(self) -> Dict[str, Any]:
        stats = super().get_stats()
        stats.update({
            "warm_contexts": len(self._warm_contexts),
            "sessions": len(self.orchestrator._sessions)
        })
        return stats

    async def shutdown(self):
        if self._browser:
            await self._browser.close()
            self._browser = None

# Create the engine instance
engine = MeshEngine()
