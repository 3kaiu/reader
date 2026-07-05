"""
Engine Factory - keep engine selection minimal and explicit.
"""
import logging
from typing import Dict, Optional
from urllib.parse import urlparse
from core.engine import BaseBypassEngine, DomainRegistry
# Import actual engines from new engines/ package
from engines.scraper import ScraperEngine
from engines.curl_impersonate import CurlImpersonateEngine
from engines.browser_probe import BrowserProbeEngine

logger = logging.getLogger(__name__)

class EngineFactory:
    def __init__(self):
        self._engines: Dict[str, BaseBypassEngine] = {}
        self._default_engine_name = "curl"
        self.domain_registry = DomainRegistry()

    def get_engine(self, name: Optional[str] = None, domain: Optional[str] = None) -> BaseBypassEngine:
        """
        Get or create an engine.

        `domain` is recorded for adaptive solving profiles.
        """
        engine_name = name or self._default_engine_name
        
        if engine_name not in self._engines:
            self._engines[engine_name] = self._create_engine(engine_name)
        
        engine = self._engines[engine_name]
        if hasattr(engine, 'domain_registry'):
            engine.domain_registry = self.domain_registry
        return engine

    def _create_engine(self, name: str) -> BaseBypassEngine:
        if name == "curl" or name == "curl_impersonate":
            logger.info("Creating CurlImpersonateEngine")
            return CurlImpersonateEngine()
        elif name == "scraper" or name == "cloudscraper":
            logger.info("Creating ScraperEngine")
            return ScraperEngine()
        elif name == "browser-probe" or name == "browser":
            logger.info("Creating BrowserProbeEngine")
            scraper = self._engines.get("scraper") or ScraperEngine()
            self._engines.setdefault("scraper", scraper)
            engine = BrowserProbeEngine(scraper_engine=scraper)
            engine.domain_registry = self.domain_registry
            return engine
        else:
            logger.warning(f"Unknown engine: {name}, falling back to curl")
            return CurlImpersonateEngine()

    async def shutdown_all(self):
        for name, engine in self._engines.items():
            logger.info(f"Shutting down engine: {name}")
            await engine.shutdown()
        self._engines.clear()

    def get_active_stats(self) -> Dict[str, dict]:
        return {name: engine.get_stats() for name, engine in self._engines.items()}

# Global factory instance
factory = EngineFactory()
