"""
Engine Factory - keep engine selection minimal and explicit.
"""
import logging
from typing import Dict
from core.engine import BaseBypassEngine
# Import actual engines from new engines/ package
from engines.scraper import ScraperEngine
from engines.browser_probe import BrowserProbeEngine

logger = logging.getLogger(__name__)

class EngineFactory:
    def __init__(self):
        self._engines: Dict[str, BaseBypassEngine] = {}
        self._default_engine_name = "scraper"

    def get_engine(self, name: str = None, domain: str = None) -> BaseBypassEngine:
        """
        Get or create an engine.

        `domain` is currently accepted for compatibility but not used for strategy
        selection, to keep this service focused on HTML fetching only.
        """
        engine_name = name or self._default_engine_name
        
        if engine_name not in self._engines:
            self._engines[engine_name] = self._create_engine(engine_name)
        
        return self._engines[engine_name]

    def _create_engine(self, name: str) -> BaseBypassEngine:
        if name == "scraper" or name == "cloudscraper":
            logger.info("Creating ScraperEngine")
            return ScraperEngine()
        elif name == "browser-probe" or name == "browser":
            logger.info("Creating BrowserProbeEngine")
            return BrowserProbeEngine()
        else:
            logger.warning(f"Unknown engine: {name}, falling back to scraper")
            return ScraperEngine()

    async def shutdown_all(self):
        for name, engine in self._engines.items():
            logger.info(f"Shutting down engine: {name}")
            await engine.shutdown()
        self._engines.clear()

    def get_active_stats(self) -> Dict[str, dict]:
        return {name: engine.get_stats() for name, engine in self._engines.items()}

# Global factory instance
factory = EngineFactory()
