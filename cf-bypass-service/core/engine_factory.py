"""
Engine Factory - Dynamically selects the best bypass engine
"""
import logging
from typing import Dict, Optional
from core.engine import BaseBypassEngine
# Import actual engines
from scraper_engine import ScraperEngine
from mesh_engine import MeshEngine

logger = logging.getLogger(__name__)

class EngineFactory:
    def __init__(self):
        self._engines: Dict[str, BaseBypassEngine] = {}
        self._default_engine_name = "scraper"

    def get_engine(self, name: str = None, domain: str = None) -> BaseBypassEngine:
        """
        Get or create an engine by name or domain preference.
        """
        engine_name = name or self._determine_engine_for_domain(domain)
        
        if engine_name not in self._engines:
            self._engines[engine_name] = self._create_engine(engine_name)
        
        return self._engines[engine_name]

    def _determine_engine_for_domain(self, domain: str) -> str:
        if not domain:
            return self._default_engine_name
            
        # Example: high-security domains use the mesh
        high_sec_domains = ["example.com", "protected-site.net"]
        if any(d in domain for d in high_sec_domains):
            return "mesh"
            
        return self._default_engine_name

    def _create_engine(self, name: str) -> BaseBypassEngine:
        if name == "scraper" or name == "cloudscraper":
            logger.info("Creating ScraperEngine (CloudScraper)")
            return ScraperEngine()
        elif name == "mesh":
            logger.info("Creating MeshEngine (Camoufox)")
            return MeshEngine()
        else:
            logger.warning(f"Unknown engine: {name}, falling back to scraper")
            return ScraperEngine()

    async def shutdown_all(self):
        for name, engine in self._engines.items():
            logger.info(f"Shutting down engine: {name}")
            await engine.shutdown()
        self._engines.clear()

# Global factory instance
factory = EngineFactory()
