"""
Browser Probe Engine — headless Chromium for Cloudflare bypass,
JS-rendered pages, and login flows.

Implements:
  - Two-phase CDP solve for managed challenges (CDP-free phase 1)
  - Browser pool with automatic recycling
  - isCfBlocked / ensureCfPassed / solveCf / runJs
"""
import asyncio
import json
import logging
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import shutil
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from core.engine import BaseBypassEngine, BypassResult
from core.utils import validate_url_not_private

logger = logging.getLogger("browser-probe")

# ─── CF Detection Markers ─────────────────────────────────────────────────
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

# No JS-level anti-detection patches.
# Per js-reverse-mcp's anti-detection architecture (Principle 1),
# Object.defineProperty hacks are themselves detectable by CF challenge JS.
# Real anti-detection happens at:
#   - Protocol layer: Playwright's default CDP (or Patchright for stronger stealth)
#   - Binary layer: CloakBrowser (49 C++ patches) for hard targets
# See AUDIT_ADVERSARIAL.md for the full analysis.


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


    async def _get_browser(self):
        """Lazy-init Chromium with minimal flag footprint.

        Per js-reverse-mcp anti-detection Principle 2, config-level
        fingerprint hacks (--disable-gpu, --window-size, etc.) are
        anti-patterns that break with every Chrome version and create
        detectable flag combinations. Keep launch args minimal:
        Docker-required flags + optimization flags only.
        """
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
                "--disable-background-networking",
                "--disable-sync",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-blink-features=AutomationControlled",
            ]
            if BROWSER_HEADLESS_DEFAULT:
                launch_args.append("--headless=new")

            self._browser = await p.chromium.launch(
                headless=BROWSER_HEADLESS_DEFAULT,
                args=launch_args,
            )
            logger.info("Chromium launched (headless=%s)", BROWSER_HEADLESS_DEFAULT)
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
            # Post-navigation SSRF check: verify the browser didn't redirect to a private IP
            validate_url_not_private(page.url)
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
            # Post-navigation SSRF check
            validate_url_not_private(page.url)
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
            # Apply strict CSP to limit script execution scope
            await page.set_extra_http_headers({
                "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline';"
            })
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
            start = time.time()
            # Navigate and execute JS in one pass (avoid double navigation)
            context = await self._get_context(session_id)
            page = await context.new_page()
            try:
                # Apply strict CSP before navigation to limit script execution
                await page.set_extra_http_headers({
                    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline';"
                })
                await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
                # Post-navigation SSRF check
                validate_url_not_private(page.url)
                js_result = await page.evaluate(js_code) if js_code else None
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
        page = None  # Initialize before try to avoid NameError in finally

        try:
            page = await (await self._get_context(session_id)).new_page()

            # Navigate with 'load' (NOT 'networkidle' — CF redirects break networkidle)
            await page.goto(url, wait_until="load", timeout=30000)
            # Post-navigation SSRF check
            validate_url_not_private(page.url)

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

    async def _solve_cf_two_phase(
        self,
        url: str,
        timeout_ms: int = 60000,
    ) -> Dict[str, Any]:
        """
        Two-phase CF solving for managed challenges.
        
        Phase 1: Launch Chrome WITHOUT CDP
          → CF cannot detect DevTools Protocol
          → Challenge resolves naturally if fingerprint is clean
          → Wait silently for challenge to resolve
        
        Phase 2: After a brief wait, connect via CDP to extract cookies
          → Uses Playwright to connect to the running Chrome instance
          → Uses Network.getCookies instead of raw SQLite polling
        """
        start = time.time()
        browser_proc = None
        user_data_dir = tempfile.mkdtemp(prefix="nexus-cf-")

        try:
            chrome_bin = self._find_chrome_binary()
            if not chrome_bin:
                logger.warning("[cf-2phase] Chrome binary not found, falling back to Playwright")
                return await self._solve_cf_playwright(url, timeout_ms)

            logger.info(f"[cf-2phase] launching Chrome without CDP: {chrome_bin}")

            # Phase 1: Launch Chrome with --headless=new + remote debugging port
            # but WITHOUT any CDP client attached. CF challenge JS runs and
            # resolves without detecting DevTools presence.
            cdp_port = self._find_free_port()
            launch_args = [
                chrome_bin,
                f"--user-data-dir={user_data_dir}",
                f"--remote-debugging-port={cdp_port}",
            ]
            if BROWSER_HEADLESS_DEFAULT:
                launch_args.append("--headless=new")
            launch_args.extend([
                "--no-sandbox",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-blink-features=AutomationControlled",
                "--disable-background-networking",
                "--disable-sync",
                url,
            ])
            browser_proc = await asyncio.create_subprocess_exec(
                *launch_args,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )

            # Phase 2: Wait silently, then connect via CDP when ready.
            # Use adaptive backoff: start with 2s, double up to 8s cap.
            deadline = time.time() + (timeout_ms / 1000)
            poll_delay = 2.0
            max_delay = 8.0
            last_mtime = 0
            cf_clearance = None
            all_cookies = {}
            cdp_connected = False

            while time.time() < deadline:
                if not cdp_connected:
                    # Check if Chrome has opened its debugging port by
                    # looking for the cookie DB existence + recent modification
                    cookie_db = os.path.join(user_data_dir, "Default", "Cookies")
                    if os.path.exists(cookie_db):
                        try:
                            mtime = os.path.getmtime(cookie_db)
                            if mtime > last_mtime:
                                last_mtime = mtime
                                # Try connecting via CDP to extract cookies
                                try:
                                    from playwright.async_api import async_playwright
                                    async with async_playwright() as pw:
                                        browser = await pw.chromium.connect_over_cdp(
                                            f"http://127.0.0.1:{cdp_port}"
                                        )
                                        cdp_connected = True
                                        context = browser.contexts[0]
                                        cookies = await context.cookies()
                                        for c in cookies:
                                            all_cookies[c["name"]] = c["value"]
                                            if c["name"] == "cf_clearance":
                                                cf_clearance = c["value"]
                                        await browser.close()

                                        if cf_clearance:
                                            logger.info(
                                                f"[cf-2phase] cf_clearance found after {time.time() - start:.1f}s"
                                            )
                                            break
                                except Exception:
                                    # CDP not ready yet, fall through to sleep
                                    pass
                        except OSError:
                            pass

                if cf_clearance:
                    break

                await asyncio.sleep(poll_delay)
                poll_delay = min(poll_delay * 1.5, max_delay)

            duration = time.time() - start

            if cf_clearance:
                logger.info(f"[cf-2phase] solved in {duration:.1f}s")
                return {
                    "ok": True,
                    "html": "",
                    "cookies": all_cookies,
                    "error": None,
                }

            logger.warning(f"[cf-2phase] cf_clearance not found after {duration:.1f}s, falling back to Playwright")
            return await self._solve_cf_playwright(url, timeout_ms)

        except Exception as e:
            logger.error(f"[cf-2phase] error: {e}")
            return await self._solve_cf_playwright(url, timeout_ms)
        finally:
            if browser_proc:
                try:
                    browser_proc.terminate()
                    await asyncio.wait_for(browser_proc.wait(), timeout=3)
                except (ProcessLookupError, asyncio.TimeoutError):
                    try:
                        browser_proc.kill()
                    except ProcessLookupError:
                        pass
            try:
                shutil.rmtree(user_data_dir, ignore_errors=True)
            except Exception:
                pass

    def _extract_domain_cf(self, url: str) -> str:
        """Extract domain from URL for cookie matching."""
        url = url.replace("http://", "").replace("https://", "")
        return url.split("/")[0].split(":")[0]

    def _find_chrome_binary(self) -> Optional[str]:
        """Locate Chrome/Chromium binary on the system."""
        chrome_paths = [
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
        for p in chrome_paths:
            if os.path.exists(p):
                return p
        try:
            import subprocess
            result = subprocess.run(
                ["which", "google-chrome", "chromium", "chromium-browser"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.strip().split("\n"):
                if line and os.path.exists(line.strip()):
                    return line.strip()
        except Exception:
            pass
        return None

    def _find_free_port(self) -> int:
        """Find a free TCP port for Chrome's remote debugging."""
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("", 0))
            return s.getsockname()[1]

    async def _solve_cf_playwright(
        self,
        url: str,
        timeout_ms: int = 30000,
    ) -> Dict[str, Any]:
        """
        Solve CF via Playwright.
        Used as fallback when two-phase CDP is unavailable or fails.
        """
        start = time.time()
        session_id = await self.acquire_session(visible=False)
        page = None
        try:
            context = await self._get_context(session_id)
            page = await context.new_page()

            await page.goto(url, wait_until="load", timeout=timeout_ms)
            # Post-navigation SSRF check
            validate_url_not_private(page.url)
            html = await page.content()

            if not is_cf_blocked(html):
                cookies = await context.cookies()
                return {
                    "ok": True,
                    "html": html,
                    "cookies": {c["name"]: c["value"] for c in cookies},
                    "error": None,
                }

            logger.info(f"[solve_cf] CF detected for {url}, attempting auto-solve...")

            has_turnstile = await page.evaluate("""
                () => {
                    const frames = document.querySelectorAll('iframe');
                    for (const f of frames) {
                        try {
                            const doc = f.contentDocument || f.contentWindow.document;
                            if (doc && doc.querySelector('.cf-turnstile-checkbox')) return true;
                        } catch(e) {}
                    }
                    return document.querySelector('.cf-turnstile-wrapper, [class*="turnstile"]') !== null;
                }
            """)

            if has_turnstile:
                logger.info("[solve_cf] Turnstile detected, clicking checkbox...")
                await page.evaluate("""
                    async () => {
                        const frames = document.querySelectorAll('iframe');
                        for (const f of frames) {
                            try {
                                const doc = f.contentDocument || f.contentWindow.document;
                                const cb = doc && doc.querySelector('.cf-turnstile-checkbox');
                                if (cb) { cb.click(); return; }
                            } catch(e) {}
                        }
                        const wrapper = document.querySelector('.cf-turnstile-wrapper');
                        if (wrapper) wrapper.click();
                    }
                """)
                await asyncio.sleep(2)
                try:
                    await page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass

            for i in range(30):
                await asyncio.sleep(1)
                current = await page.content()
                if not is_cf_blocked(current):
                    html = current
                    logger.info(f"[solve_cf] CF cleared after {i+1}s")
                    break
            else:
                logger.warning("[solve_cf] CF not cleared after 30s")
                return {
                    "ok": False,
                    "html": html,
                    "cookies": {},
                    "error": "CF challenge not cleared after 30s",
                }

            cookies = await context.cookies()
            duration = time.time() - start
            logger.info(f"[solve_cf] CF solved in {duration:.1f}s")
            return {
                "ok": True,
                "html": html,
                "cookies": {c["name"]: c["value"] for c in cookies},
                "error": None,
            }

        except Exception as e:
            logger.error(f"[solve_cf] error: {e}")
            return {
                "ok": False,
                "html": "",
                "cookies": {},
                "error": str(e),
            }
        finally:
            if page:
                await page.close()
            await self.release_session(session_id)

    async def solve_cf(
        self,
        url: str,
        timeout_ms: int = 30000,
        use_two_phase: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Automatic CF Turnstile solving with adaptive per-domain strategy.
        
        Uses domain registry to pick the best method:
        - Two-phase CDP for managed challenges (avoids CDP detection)
        - Playwright+stealth for non-interactive Turnstile
        - Learns from history which method works best per domain
        """
        domain = self._extract_domain_cf(url)
        profile = None
        if self.domain_registry:
            profile = await self.domain_registry.get(domain)
            if not profile.should_attempt():
                logger.warning(f"[adaptive] circuit OPEN for {domain}, skipping solve")
                return {
                    "ok": False,
                    "html": "",
                    "cookies": {},
                    "error": f"Circuit open for {domain}: {profile._consecutive_failures} consecutive failures (cooldown {(profile._cooldown_until - time.time()):.0f}s)",
                }
            if use_two_phase is None:
                method = profile.best_method()
                use_two_phase = (method == "two_phase")
                logger.info(f"[adaptive] domain={domain} best_method={method} use_two_phase={use_two_phase}")
            else:
                method = "two_phase" if use_two_phase else "playwright"
        else:
            method = "two_phase" if (use_two_phase if use_two_phase is not None else True) else "playwright"

        start = time.time()
        if use_two_phase:
            result = await self._solve_cf_two_phase(url, timeout_ms)
        else:
            result = await self._solve_cf_playwright(url, timeout_ms)

        duration = time.time() - start
        if profile:
            profile.record(method, duration, result.get("ok", False))
            logger.info(f"[adaptive] domain={domain} method={method} ok={result.get('ok')} duration={duration:.1f}s best={profile.best_method()}")

        return result

    # ─── BaseBypassEngine Interface ────────────────────────────────────────

    def __init__(self, scraper_engine=None):
        super().__init__("browser-probe")
        self._playwright = None
        self._browser = None
        self._browser_lock = asyncio.Lock()
        self._contexts: Dict[str, Any] = {}
        self._metrics: Dict[str, float] = defaultdict(float)
        self._session_counter = 0
        # Accept an injected ScraperEngine (from factory) instead of creating one internally.
        # Falls back to lazy import for backward compatibility.
        self._scraper = scraper_engine
        # Adaptive domain solving registry (injected by factory)
        self.domain_registry = None

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
        Two-phase fetch: first try a lightweight HTTP request (via injected ScraperEngine),
        detect CF challenge, then fall back to browser probe if needed.
        """
        scraper = self._scraper
        if scraper is None:
            # Lazy fallback — only when no factory-injected instance available
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
        if self.domain_registry:
            stats["adaptive_domains"] = self.domain_registry.all_summaries()
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