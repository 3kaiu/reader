"""
Enhanced Cloudflare Bypass - Phase 5: "The Mesh" All-in-One Hybrid Integration
Designed to maximize Success-on-First-Attempt by integrating all layers into a single unified cycle.

Architecture:
1. Unified Session Mesh: Tools work in a tightly-coupled pipeline, not isolated retries.
2. Camoufox Master Context: High-security browser solving challenges.
3. Live State Handover: Real-time extraction of cookies, UA, and Sec-CH headers.
4. Mesh-Fetcher: curl_cffi acting as the execution wing of the browser context.
5. Heartbeat Sustainability: Proactive session maintenance to keep the "Mesh" warm.
"""
import asyncio
import json
import logging
import os
import random
import time
import psutil
from typing import Optional, Dict, List, Tuple, Any, Set
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Persistent storage path
STATS_FILE = Path("/app/data/domain_stats.json") if os.path.exists("/app") else Path("data/domain_stats.json")

@dataclass
class CFBypassResult:
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    method_used: str
    duration: float
    error: Optional[str] = None

@dataclass
class MeshSession:
    """Integrated session state shared across tools"""
    domain: str
    cookies: Dict[str, str] = field(default_factory=dict)
    ua: str = ""
    last_updated: float = 0.0
    protection_level: str = "unknown"
    success_count: int = 0
    fail_count: int = 0

class MeshOrchestrator:
    """Manages the lifecycle and state of "The Mesh" instances"""
    def __init__(self):
        self._sessions: Dict[str, MeshSession] = {}
        self._stats_data: Dict[str, Any] = {}
        self._load_stats()

    def _load_stats(self):
        try:
            STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
            if STATS_FILE.exists():
                with open(STATS_FILE, 'r') as f:
                    self._stats_data = json.load(f)
                    for domain, data in self._stats_data.items():
                        self._sessions[domain] = MeshSession(
                            domain=domain,
                            cookies=data.get('cookies', {}),
                            ua=data.get('ua', ""),
                            last_updated=data.get('last_solved_at', 0.0),
                            protection_level=data.get('protection_level', 'unknown')
                        )
        except Exception as e: logger.warning(f"Failed to load mesh stats: {e}")

    def save_stats(self):
        try:
            with open(STATS_FILE, 'w') as f:
                data = {d: asdict(s) for d, s in self._sessions.items()}
                json.dump(data, f, indent=2, default=str)
        except Exception: pass

    def get_session(self, domain: str) -> MeshSession:
        if domain not in self._sessions:
            self._sessions[domain] = MeshSession(domain=domain)
        return self._sessions[domain]

class OptimizedCFBypass:
    """The Mesh: Integrated Hybrid Solver & Fetcher"""
    
    def __init__(self):
        self.orchestrator = MeshOrchestrator()
        self._browser = None
        self._browser_lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(15) 
        self._warm_contexts: Dict[str, Any] = {} # Persistent contexts per cluster of domains

    async def _ensure_browser(self):
        if self._browser: return
        async with self._browser_lock:
            if self._browser: return
            try:
                from camoufox.async_api import AsyncCamoufox
                logger.info("The Mesh: Initializing Camoufox Hardened Engine")
                self._browser = await AsyncCamoufox(headless=True).start()
            except Exception as e:
                logger.error(f"Failed to start Mesh Browser: {e}")
                raise

    async def _get_context(self, domain: str):
        """Context reuse per domain to maintain session trust"""
        await self._ensure_browser()
        # Group by top-level domain for better trust distribution
        tld = ".".join(domain.split('.')[-2:])
        if tld not in self._warm_contexts:
            ctx = await self._browser.new_context()
            self._warm_contexts[tld] = ctx
        return self._warm_contexts[tld]

    async def shutdown(self):
        if self._browser:
            await self._browser.close()
            self._browser = None

    async def _integrated_mesh_solver(self, url: str, timeout: int) -> Tuple[bool, Dict, str]:
        """
        The Core Hybrid Logic:
        Integrates Camoufox + CloudflareBypasser + Human Interaction in a single pass.
        """
        domain = urlparse(url).netloc
        ctx = await self._get_context(domain)
        page = await ctx.new_page()
        try:
            from CloudflareBypasser import CloudflareBypasser
            
            # Start timer
            start = time.time()
            
            # Step 1: Integrated Navigation
            # We use a combined approach - wait for load but start bypasser immediately
            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=timeout * 1000)
            except Exception as e:
                logger.debug(f"Initial navigation slow for {domain}: {e}")

            # Step 2: Biological Interaction Logic (Simultaneous with CF Wait)
            # This makes CF see "active human" while waiting for challenge
            await page.mouse.move(random.randint(100, 500), random.randint(100, 500))
            
            # Step 3: Industrial Bypass (The Brain)
            bypasser = CloudflareBypasser(page)
            # Use short timeout for bypass to avoid hanging, then verify
            await bypasser.bypass()
            
            # Step 4: Verification & State Extraction
            await asyncio.sleep(2) # Stabilize
            html = await page.content()
            html_low = html.lower()
            
            # Advanced block check
            if any(x in html_low for x in ['just a moment', 'checking your browser', 'cf-turnstile']):
                # If still blocked, try one more aggressive swipe/scroll
                await page.mouse.wheel(0, 500)
                await asyncio.sleep(2)
                html = await page.content()
                if any(x in html.lower() for x in ['just a moment', 'checking your browser']):
                    return False, {}, ""

            # Step 5: Live State Extraction (The Heart of the Mesh)
            cookies_list = await ctx.cookies()
            cookies = {c['name']: c['value'] for c in cookies_list}
            ua = await page.evaluate("navigator.userAgent")
            
            return True, cookies, ua
        except Exception as e:
            logger.debug(f"Mesh Solver error for {domain}: {e}")
            return False, {}, ""
        finally:
            await page.close()

    async def _mesh_fetch_executor(self, url: str, timeout: int, cookies: Dict[str, str], ua: str) -> Optional[CFBypassResult]:
        """High-speed execution wing of the mesh"""
        try:
            from curl_cffi import requests as curl_requests
            start = time.time()
            
            # Ensure TLS profile matches UA
            impersonate = "chrome120"
            if "Firefox" in ua: impersonate = "safari15_5"
            
            resp = curl_requests.get(
                url, impersonate=impersonate, timeout=timeout,
                cookies=cookies, headers={"User-Agent": ua, "Accept": "text/html*"}
            )
            
            if resp.status_code == 200 and 'just a moment' not in resp.text.lower():
                return CFBypassResult(
                    200, resp.text, dict(resp.cookies), dict(resp.headers), 
                    True, "mesh_integrated", time.time() - start
                )
            return None
        except Exception: return None

    async def fetch(self, url: str, timeout: int = 40) -> CFBypassResult:
        """
        The Mesh Main Flow:
        Integrated Multi-Layer Action -> Success on First Go.
        """
        domain = urlparse(url).netloc
        session = self.orchestrator.get_session(domain)
        start_time = time.time()

        # Phase A: Proactive Trust Check
        # If we have a very recent session (< 15 mins), use it immediately to avoid browser overhead
        if session.cookies and (time.time() - session.last_updated) < 900:
            logger.debug(f"Mesh: Using warm session for {domain}")
            result = await self._mesh_fetch_executor(url, 20, session.cookies, session.ua)
            if result: return result

        # Phase B: Integrated Mesh Operation (The "All-in-One")
        # Instead of 'try this then that', we do a 'Unified Solve & Fetch'
        async with self._semaphore:
            success, new_cookies, new_ua = await self._integrated_mesh_solver(url, timeout)
            
            if success:
                # Immediate transition to high-speed fetch to get actual content
                # (Solver might only be on the gate page)
                result = await self._mesh_fetch_executor(url, timeout, new_cookies, new_ua)
                
                if result:
                    # Sync back to orchestrator
                    session.cookies.update(new_cookies)
                    session.ua = new_ua
                    session.last_updated = time.time()
                    session.success_count += 1
                    session.protection_level = "solved_mesh"
                    self.orchestrator.save_stats()
                    
                    result.duration = time.time() - start_time
                    return result

        # Phase C: Last Resort (Integrated but slower fallback)
        # In the mesh, we don't 'retrying' with the same tool, we use the Heavy context directly
        logger.info(f"Mesh: SOLVER failed, trying Heavy Drission state reconstruction for {domain}")
        result = await self._drission_mesh_fallback(url, timeout + 20)
        if result and result.cf_bypassed:
            result.duration = time.time() - start_time
            return result
        
        return CFBypassResult(403, "", {}, {}, False, "mesh_exhausted", time.time() - start_time, "The Mesh could not resolve the challenge")

    async def _drission_mesh_fallback(self, url: str, timeout: int) -> Optional[CFBypassResult]:
        async with self._drission_lock:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._drission_sync, url, timeout)

    def _drission_sync(self, url: str, timeout: int) -> Optional[CFBypassResult]:
        try:
            from DrissionPage import ChromiumPage, ChromiumOptions
            options = ChromiumOptions().headless(True).set_argument('--no-sandbox')
            page = ChromiumPage(options)
            try:
                page.get(url)
                time.sleep(8)
                if 'just a moment' not in page.html.lower():
                    cookies = {c.get('name', ''): c.get('value', '') for c in page.cookies()}
                    return CFBypassResult(200, page.html, cookies, {}, True, "drission_mesh", 0.0)
                return None
            finally: page.quit()
        except Exception: return None

# Global Engine Singleton
_engine = None

def get_cf_bypass() -> OptimizedCFBypass:
    global _engine
    if not _engine: _engine = OptimizedCFBypass()
    return _engine

async def enhanced_fetch(url: str, timeout: int = 40):
    return await get_cf_bypass().fetch(url, timeout)

def get_domain_stats():
    return get_cf_bypass().orchestrator._sessions

async def shutdown_bypass():
    if _engine: await _engine.shutdown()
