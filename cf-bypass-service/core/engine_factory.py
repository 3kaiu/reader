"""
Engine Factory - Dynamically selects the best bypass engine
"""
import logging
from typing import Dict, Optional
from core.protocol import BypassEngine
from cloudscraper_wrapper import CloudScraperWrapper
from enhanced_cf_bypass import OptimizedCFBypass

logger = logging.getLogger(__name__)

class EngineFactory:
    def __init__(self):
        self._engines: Dict[str, BypassEngine] = {}
        self._default_engine_name = "cloudscraper"

    def get_engine(self, name: str = None, domain: str = None) -> BypassEngine:
        """
        Get or create an engine by name or domain preference.
        """
        # Logic to determine engine based on domain can be added here
        engine_name = name or self._determine_engine_for_domain(domain)
        
        if engine_name not in self._engines:
            self._engines[engine_name] = self._create_engine(engine_name)
        
        return self._engines[engine_name]

    def _determine_engine_for_domain(self, domain: str) -> str:
        # For now, default to cloudscraper unless specific domains are known to require "the mesh"
        if not domain:
            return self._default_engine_name
            
        # Example: high-security domains use the mesh
        high_sec_domains = ["example.com", "protected-site.net"]
        if any(d in domain for d in high_sec_domains):
            return "mesh"
            
        return self._default_engine_name

    def _create_engine(self, name: str) -> BypassEngine:
        if name == "cloudscraper":
            logger.info("Creating CloudScraper engine")
            return CloudScraperWrapper()
        elif name == "mesh":
            logger.info("Creating Mesh (Camoufox) engine")
            return OptimizedCFBypass()
        else:
            raise ValueError(f"Unknown engine: {name}")

# Global factory instance
factory = EngineFactory()
