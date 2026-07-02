"""
Browser Probe Engine — headless Chromium for Cloudflare bypass,
JS-rendered pages, and login flows.

Implements the Legado Tauri-inspired approach:
  isCfBlocked(html) -> bool          — detect CF/Turnstile/challenge pages
  ensureCfPassed(url, html) -> str   — spin up browser, complete challenge, return real HTML
  run_js(url, js_code) -> str        — execute arbitrary JS in page context
  acquire_session() / release()      — session lifecycle management
"""
import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from core.engine import BaseBypassEngine, BypassResult

logger = logging.getLogger("browser-probe")

# ─── CF Detection Markers (from Legado docs) ──────────────────────────────
CF_MARKERS = [
    "Just a moment",
    "cf-browser-verification",
    "Checking your browser",
    "cf-challenge-running",
    "managed_checking_msg",
    "cf-please-wait",
    "cf-turnstile-wrapper",
    "正在进行安全验证",
    "challenge-platform",
    "ddos protection",
    "security check",
]

BROWSER_HEADLESS_DEFAULT = os.getenv("BROWSER_PROBE_HEADLESS", "true").lower() in ("true", "1", "yes")
CF_POLL_INTERVAL_MS = int(os.getenv("CF_POLL_INTERVAL_MS", "1000"))
CF_MAX_ATTEMPTS = int(os.getenv("CF_MAX_ATTEMPTS", "60"))
BROWSER_POOL_SIZE = int(os.getenv("BROWSER_POOL_SIZE", "4"))


def is_cf_blocked(html: Optional[str]) -> bool:
    """Detect if the HTTP response is a Cloudflare challenge/interstitial page."""
    if not html or len(html) < 200:
        return True
    lower = html.lower()
    for marker in CF_MARKERS:
        if marker.lower() in lower:
            logger.debug(f"[CF] blocked: matched '{marker}'")
            return True
    return False


# ─── Lazy Playwright Import ──────────────────────────────────────────────
_playwright = None

async def _ensure_playwright():
    global _playwright
    if _playwright is not None:
        return _playwright
    try:
        from playwright.async_api import async_playwright
        _playwright = async_playwright()
        logger.info("Playwright imported successfully")
        return _playwright
    except ImportError:
        logger.error("Playwright not installed. Run: playwright install chromium")
        raise


class BrowserProbeEngine(BaseBypassEngine):
    """
    Headless browser engine that can:
    - Detect Cloudflare/Turnstile challenges
    - Complete challenges via real browser rendering
    - Execute arbitrary JS in page context
    - Return the real rendered HTML after challenge completion
    """

    def __init__(self):
        super().__init__("browser-probe")
        self._playwright = None
        self._browser = None
        self._browser_lock = asyncio.Lock()
        self._contexts: Dict[str, Any] = {}  # session_id -> browser context
        self._metrics: Dict[str, float] = defaultdict(float)
        self._session_counter = 0

    async def _get_browser(self):
        """Lazy-init headless Chromium (shared across sessions)."""
        if self._browser is not None:
            return self._browser
        async with self._browser_lock:
            if self._browser is not None:
                return self._browser
            pw = await _ensure_playwright()
            p = await pw.start()
            self._playwright = p
            launch_args = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-web-security",  # needed for some cross-origin CF pages
            ]
            if BROWSER_HEADLESS_DEFAULT:
                launch_args.append("--headless=new")

            self._browser = await p.chromium.launch(
                headless=BROWSER_HEADLESS_DEFAULT,
                args=launch_args,
            )
            logger.info("Headless Chromium launched")
            return self._browser

    async def acquire_session(
        self,
        session_id: Optional[str] = None,
        visible: bool = False,
        user_agent: Optional[str] = None,
    ) -> str:
        """
        Acquire a new browser session (isolated context).
        Returns the session ID.
        """
        browser = await self._get_browser()
        if session_id is None:
            self._session_counter += 1
            session_id = f"probe-{self._session_counter}"

        context = await browser.new_context(
            no_viewport=True,
            user_agent=user_agent or (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
        )
        self._contexts[session_id] = context
        logger.info(f"[session] acquired: {session_id} (visible={visible})")
        return session_id

    async def release_session(self, session_id: str):
        """Close and release a browser session."""
        context = self._contexts.pop(session_id, None)
        if context:
            await context.close()
            logger.info(f"[session] released: {session_id}")

    async def _get_context(self, session_id: str):
        context = self._contexts.get(session_id)
        if context is None:
            raise ValueError(f"No session found: {session_id}")
        return context

    async def navigate(
        self,
        session_id: str,
        url: str,
        wait_until: str = "load",
        timeout_ms: int = 30000,
    ) -> Dict[str, Any]:
        """Navigate to a URL in the given session and return page info."""
        context = await self._get_context(session_id)
        page = await context.new_page()
        try:
            await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            title = await page.title()
            html = await page.content()
            current_url = page.url
            return {"title": title, "html": html, "url": current_url}
        finally:
            await page.close()

    async def navigate_and_wait(
        self,
        session_id: str,
        url: str,
        wait_until: str = "load",
        timeout_ms: int = 30000,
        keep_page: bool = False,
    ) -> Any:
        """Navigate and optionally keep the page open for further interaction."""
        context = await self._get_context(session_id)
        page = await context.new_page()
        try:
            await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            if keep_page:
                return page
            title = await page.title()
            html = await page.content()
            current_url = page.url
            return {"title": title, "html": html, "url": current_url}
        finally:
            if not keep_page:
                await page.close()

    async def eval_js(self, session_id: str, js_code: str) -> Any:
        """Evaluate JavaScript in the current page of a session."""
        context = await self._get_context(session_id)
        page = await context.new_page()
        try:
            result = await page.evaluate(js_code)
            return result
        finally:
            await page.close()

    async def get_page_html(self, session_id: str) -> Optional[str]:
        """Get the current page HTML from a session."""
        context = await self._get_context(session_id)
        page = await context.new_page()
        try:
            html = await page.content()
            return html
        finally:
            await page.close()

    async def get_cookies(self, session_id: str, url: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get cookies from a session, optionally filtered by URL."""
        context = await self._get_context(session_id)
        if url:
            return await context.cookies(url)
        return await context.cookies()

    async def run_js_and_return_html(
        self, url: str, js_code: str, visible: bool = False, wait_until: str = "load", timeout_ms: int = 30000
    ) -> BypassResult:
        """One-shot: navigate to URL, execute JS, return HTML."""
        session_id = await self.acquire_session(visible=visible)
        try:
            result = await self.navigate_and_wait(
                session_id, url, wait_until=wait_until, timeout_ms=timeout_ms, keep_page=False
            )
            start = time.time()
            # Execute the JS after navigation
            context = await self._get_context(session_id)
            page = await context.new_page()
            try:
                await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
                js_result = await page.evaluate(js_code)
                html = await page.content()
            finally:
                await page.close()

            duration = time.time() - start
            return BypassResult(
                status=200,
                html=html,
                cf_bypassed=True,
                duration=duration,
                engine=self.name,
                headers={},
                cookies={c["name"]: c["value"] for c in await self.get_cookies(session_id)},
            )
        except Exception as e:
            logger.error(f"run_js failed: {e}")
            return BypassResult(
                status=500,
                html="",
                cf_bypassed=False,
                error=str(e),
                engine=self.name,
            )
        finally:
            await self.release_session(session_id)

    async def ensure_cf_passed(
        self,
        url: str,
        original_html: str,
        poll_interval_ms: int = CF_POLL_INTERVAL_MS,
        max_attempts: int = CF_MAX_ATTEMPTS,
    ) -> BypassResult:
        """
        Full Legado-style CF bypass flow:
        1. Check if CF is blocked via markers
        2. If blocked, spin up headless browser
        3. Poll until CF passes or timeout
        4. Sync cookies back
        """
        if not is_cf_blocked(original_html):
            return BypassResult(
                status=200,
                html=original_html,
                cf_bypassed=True,
                cookies={},
                headers={},
                engine=self.name,
            )

        logger.info(f"[CF] detected challenge for {url}, starting browser probe...")
        start = time.time()

        session_id = await self.acquire_session(visible=False)
        browser_shown = False
        passed = False
        real_html = None

        try:
            page = await (await self._get_context(session_id)).new_page()

            # Navigate with 'load' (NOT 'networkidle' — CF redirects break networkidle)
            await page.goto(url, wait_until="load", timeout=30000)

            for attempt in range(max_attempts):
                await asyncio.sleep(poll_interval_ms / 1000.0)
                page_html = await page.content()

                if page_html and len(page_html) > 500 and not is_cf_blocked(page_html):
                    passed = True
                    real_html = page_html
                    logger.info(f"[CF] passed on attempt {attempt + 1}/{max_attempts}")
                    break

                # Show browser only when we detect the challenge is real
                if not browser_shown:
                    logger.info("[CF] challenge detected, showing browser for user interaction...")
                    browser_shown = True

            if not passed:
                logger.warning(f"[CF] timeout after {max_attempts} attempts")
                return BypassResult(
                    status=403,
                    html=original_html,
                    cf_bypassed=False,
                    error="CF challenge timeout",
                    duration=time.time() - start,
                    engine=self.name,
                )

            # Sync cookies
            cookies = await self.get_cookies(session_id, url)
            cookie_dict = {c["name"]: c["value"] for c in cookies}

            duration = time.time() - start
            return BypassResult(
                status=200,
                html=real_html or original_html,
                cf_bypassed=True,
                cookies=cookie_dict,
                headers={},
                duration=duration,
                engine=self.name,
            )

        except Exception as e:
            logger.error(f"[CF] browser probe error: {e}")
            return BypassResult(
                status=500,
                html=original_html,
                cf_bypassed=False,
                error=str(e),
                duration=time.time() - start,
                engine=self.name,
            )
        finally:
            if page:
                await page.close()
            await self.release_session(session_id)

    # ─── BaseBypassEngine Interface ────────────────────────────────────────

    async def fetch(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        body: Optional[str] = None,
        timeout: int = 30,
        proxy: Optional[str] = None,
        **kwargs,
    ) -> BypassResult:
        """
        Two-phase fetch: first try a lightweight HTTP request (via ScraperEngine),
        detect CF challenge, then fall back to browser probe if needed.
        """
        from engines.scraper import ScraperEngine
        scraper = ScraperEngine()
        result = await scraper.fetch(url, method, headers, body, timeout, proxy)

        if result.cf_bypassed and result.status == 200:
            return result

        # CF blocked — escalate to browser probe
        logger.info(f"[browser-probe] CF blocked, escalating to browser: {url}")
        return await self.ensure_cf_passed(url, result.html)

    async def warmup(self, domain: str) -> bool:
        """Pre-warm: launch browser."""
        try:
            await self._get_browser()
            return True
        except Exception as e:
            logger.warning(f"warmup failed for {domain}: {e}")
            return False

    def get_stats(self) -> Dict[str, Any]:
        stats = super().get_stats()
        stats.update({
            "active_sessions": len(self._contexts),
            "browser_loaded": self._browser is not None,
        })
        return stats

    async def shutdown(self):
        """Clean up browser and all sessions."""
        for sid in list(self._contexts.keys()):
            await self.release_session(sid)
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.__aexit__(None, None, None)
        logger.info("Browser probe engine shut down")