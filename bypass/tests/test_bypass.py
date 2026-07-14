"""Tests for bypass service core functionality."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from main import app
from core.engine_factory import EngineFactory
from core.engine import BaseBypassEngine
from core.errors import BypassError
from core.engine import DomainRegistry, CircuitState
from core.errors import ErrorCode


class TestEngineFactory:
    """Tests for EngineFactory."""

    def test_factory_initialization(self):
        """Test that factory initializes with default engine."""
        factory = EngineFactory()
        assert factory is not None
        assert factory._default_engine_name == "curl"

    def test_get_engine_creates_engine(self):
        """Test that get_engine creates engine if not cached."""
        factory = EngineFactory()
        engine = factory.get_engine(name="curl")
        assert engine is not None

    def test_get_engine_returns_cached(self):
        """Test that get_engine returns cached engine on second call."""
        factory = EngineFactory()
        engine1 = factory.get_engine(name="curl")
        engine2 = factory.get_engine(name="curl")
        assert engine1 is engine2

    def test_get_engine_unknown_falls_back(self):
        """Test that getting unknown engine falls back to default."""
        factory = EngineFactory()
        engine = factory.get_engine(name="unknown-engine")
        assert engine is not None


class TestBaseBypassEngine:
    """Tests for BaseBypassEngine abstract base class."""

    def test_base_engine_cannot_be_instantiated_directly(self):
        """Test that BaseBypassEngine cannot be instantiated directly."""
        with pytest.raises(TypeError):
            BaseBypassEngine()

    def test_concrete_engine_must_implement_fetch(self):
        """Test that concrete engine must implement fetch method."""
        class IncompleteEngine(BaseBypassEngine):
            pass
        
        with pytest.raises(TypeError):
            IncompleteEngine()

    def test_concrete_engine_works(self):
        """Test that concrete engine with all methods works."""
        class CompleteEngine(BaseBypassEngine):
            async def fetch(self, *args, **kwargs):
                return "test"
            async def warmup(self, domain: str):
                return True
            def get_stats(self):
                return {"name": self.name}
            async def shutdown(self):
                pass
        
        engine = CompleteEngine("test")
        assert engine.name == "test"


class TestEngineFactoryIntegration:
    """Integration tests for EngineFactory with real engines."""

    def test_get_engine_creates_curl_engine(self):
        factory = EngineFactory()
        factory._engines.clear()
        
        engine = factory.get_engine("curl")
        assert engine is not None

    def test_get_engine_creates_scraper_engine(self):
        factory = EngineFactory()
        factory._engines.clear()
        
        engine = factory.get_engine("scraper")
        assert engine is not None

    def test_get_engine_creates_browser_probe_engine(self):
        factory = EngineFactory()
        factory._engines.clear()
        
        engine = factory.get_engine("browser-probe")
        assert engine is not None


class TestErrorClasses:
    """Tests for error classes."""

    def test_bypass_error_creation(self):
        """Test BypassError creation."""
        error = BypassError(
            ErrorCode.NETWORK_ERROR,
            "Test error",
            context={"url": "https://example.com"}
        )
        assert str(error) == "Test error"
        assert error.code == ErrorCode.NETWORK_ERROR
        assert error.context["url"] == "https://example.com"

    def test_error_code_enum(self):
        """Test ErrorCode enum values."""
        assert ErrorCode.NETWORK_ERROR.value == 1000
        assert ErrorCode.TIMEOUT.value == 1001
        assert ErrorCode.CLOUDFLARE_CHALLENGE.value == 2000
        assert ErrorCode.INTERNAL_ERROR.value == 0


class TestDomainRegistry:
    """Tests for DomainRegistry."""

    def test_domain_registry_tracks_domains(self):
        registry = DomainRegistry()
        
        profile = registry.get("example.com")
        profile.record("playwright", 1.5, True)
        profile.record("playwright", 2.0, False)
        
        assert profile._consecutive_failures == 1
        # With < 3 history entries, best_method returns two_phase (default)
        from core.engine import DomainProfile
        assert profile.best_method() == DomainProfile.METHOD_TWO_PHASE

    def test_domain_registry_circuit_breaker(self):
        registry = DomainRegistry()
        
        profile = registry.get("blocked.com")
        # Record 3 failures to open circuit
        for _ in range(3):
            profile.record("playwright", 1.0, False)
        
        assert profile._circuit_state == CircuitState.OPEN
        assert profile.should_attempt() is False


class TestErrorCodes:
    """Tests for ErrorCode enum."""

    def test_network_errors(self):
        assert ErrorCode.NETWORK_ERROR.value == 1000
        assert ErrorCode.TIMEOUT.value == 1001
        assert ErrorCode.DNS_RESOLUTION_FAILED.value == 1002
        assert ErrorCode.CONNECTION_REFUSED.value == 1003
        assert ErrorCode.TLS_HANDSHAKE_FAILED.value == 1004

    def test_anticrawl_errors(self):
        assert ErrorCode.CLOUDFLARE_CHALLENGE.value == 2000
        assert ErrorCode.CLOUDFLARE_CHALLENGE_FAILED.value == 2001
        assert ErrorCode.RATE_LIMITED.value == 2002
        assert ErrorCode.IP_BANNED.value == 2003
        assert ErrorCode.ALL_STRATEGIES_FAILED.value == 2004
        assert ErrorCode.CIRCUIT_OPEN.value == 2005
        assert ErrorCode.STRATEGY_DISABLED.value == 2006


if __name__ == "__main__":
    pytest.main([__file__, "-v"])