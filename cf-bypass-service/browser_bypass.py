"""
Browser-based Cloudflare Bypass using nodriver
Uses undetected Chrome browser for sites with strong CF protection
"""
import asyncio
import logging
from typing import Optional, Dict
from dataclasses import dataclass
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

@dataclass
class BrowserFetchResult:
    """Result from browser fetch"""
    status: int
    html: str
    cookies: Dict[str, str]
    headers: Dict[str, str]
    cf_bypassed: bool
    error: Optional[str] = None


class BrowserBypass:
    """
    Real browser-based Cloudflare bypass using nodriver (undetected Chrome)
    Used as fallback when CloudScraper fails
    """
    
    def __init__(self):
        self._browser = None
        self._lock = asyncio.Lock()
        self._initialized = False
    
    async def _ensure_browser(self):
        """Lazy initialization of browser"""
        if self._browser is not None:
            return
        
        async with self._lock:
            if self._browser is not None:
                return
            
            try:
                import nodriver as uc
                
                # Create browser with stealth settings
                self._browser = await uc.start(
                    headless=True,
                    browser_args=[
                        '--disable-blink-features=AutomationControlled',
                        '--disable-dev-shm-usage',
                        '--no-sandbox',
                        '--disable-gpu',
                        '--window-size=1920,1080',
                    ]
                )
                self._initialized = True
                logger.info("Browser bypass: Chrome initialized successfully")
                
            except Exception as e:
                logger.error(f"Failed to initialize browser: {e}")
                raise
    
    async def fetch(
        self,
        url: str,
        timeout: int = 30,
        wait_for_cf: bool = True
    ) -> BrowserFetchResult:
        """
        Fetch URL using real browser to bypass Cloudflare
        
        Args:
            url: URL to fetch
            timeout: Maximum wait time in seconds
            wait_for_cf: Whether to wait for CF challenge to complete
        
        Returns:
            BrowserFetchResult with page content
        """
        await self._ensure_browser()
        
        page = None
        try:
            # Open new tab
            page = await self._browser.get(url, new_tab=True)
            
            # Wait for CF challenge to complete if present
            if wait_for_cf:
                await self._wait_for_cf_bypass(page, timeout)
            
            # Get page content
            html = await page.get_content()
            
            # Get cookies
            cookies_list = await page.send(
                "Network.getCookies",
                {"urls": [url]}
            )
            cookies = {
                c['name']: c['value'] 
                for c in cookies_list.get('cookies', [])
            }
            
            # Check if CF was bypassed
            cf_indicators = [
                'just a moment', 'checking your browser',
                'challenge-platform', 'cf-turnstile'
            ]
            cf_bypassed = not any(
                indicator in html.lower() 
                for indicator in cf_indicators
            )
            
            logger.info(f"Browser fetch: {url} - CF bypassed: {cf_bypassed}")
            
            return BrowserFetchResult(
                status=200 if cf_bypassed else 403,
                html=html,
                cookies=cookies,
                headers={},
                cf_bypassed=cf_bypassed
            )
            
        except asyncio.TimeoutError:
            logger.error(f"Browser fetch timeout: {url}")
            return BrowserFetchResult(
                status=408,
                html="",
                cookies={},
                headers={},
                cf_bypassed=False,
                error="Timeout waiting for page"
            )
            
        except Exception as e:
            logger.error(f"Browser fetch error: {e}")
            return BrowserFetchResult(
                status=500,
                html="",
                cookies={},
                headers={},
                cf_bypassed=False,
                error=str(e)
            )
            
        finally:
            # Close tab if opened
            if page:
                try:
                    await page.close()
                except Exception:
                    pass
    
    async def _wait_for_cf_bypass(self, page, timeout: int):
        """Wait for Cloudflare challenge to complete"""
        start_time = asyncio.get_event_loop().time()
        
        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout:
                raise asyncio.TimeoutError()
            
            # Check page content for CF indicators
            try:
                html = await page.get_content()
                html_lower = html.lower()
                
                # CF challenge indicators
                cf_indicators = [
                    'just a moment',
                    'checking your browser',
                    'challenge-platform',
                    'cf-turnstile',
                    'cf-chl-widget'
                ]
                
                # If no CF indicators, we're through
                if not any(ind in html_lower for ind in cf_indicators):
                    logger.info("CF challenge completed")
                    return
                
                # Wait and retry
                await asyncio.sleep(1)
                
            except Exception as e:
                logger.debug(f"Error checking page: {e}")
                await asyncio.sleep(1)
    
    async def close(self):
        """Close browser"""
        if self._browser:
            try:
                self._browser.stop()
                self._browser = None
                self._initialized = False
                logger.info("Browser closed")
            except Exception as e:
                logger.error(f"Error closing browser: {e}")


# Singleton instance
_browser_bypass: Optional[BrowserBypass] = None


async def get_browser_bypass() -> BrowserBypass:
    """Get singleton browser bypass instance"""
    global _browser_bypass
    if _browser_bypass is None:
        _browser_bypass = BrowserBypass()
    return _browser_bypass


async def browser_fetch(url: str, timeout: int = 30) -> BrowserFetchResult:
    """
    Convenience function to fetch URL with browser
    
    Args:
        url: URL to fetch
        timeout: Timeout in seconds
    
    Returns:
        BrowserFetchResult
    """
    bypass = await get_browser_bypass()
    return await bypass.fetch(url, timeout)
