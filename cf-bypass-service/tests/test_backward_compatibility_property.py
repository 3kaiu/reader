"""
Property-based tests for backward compatibility
Feature: cf-bypass-phase2-optimizations

Tests that Phase 2 optimizations maintain backward compatibility:
- Existing API endpoints maintain their contracts
- Disabled optimizations fall back gracefully
- Feature flags control optimization behavior
- Failed optimizations degrade gracefully
"""
import sys
import os
import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cloudscraper_wrapper import CloudScraperWrapper, FetchResult
from phase2_config import phase2_config
import cloudscraper


class TestBackwardCompatibilityProperties:
    """Property-based tests for backward compatibility"""
    
    @pytest.mark.asyncio
    @given(
        domain=st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd'), min_codepoint=97, max_codepoint=122), min_size=5, max_size=20),
        status_code=st.integers(min_value=200, max_value=599),
        html_content=st.text(min_size=10, max_size=1000)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_29_existing_endpoints_maintain_contracts(
        self, domain, status_code, html_content
    ):
        """
        Property 29: Existing endpoints maintain contracts
        
        For any valid request, the response format should remain unchanged
        regardless of Phase 2 optimizations being enabled or disabled.
        
        Feature: cf-bypass-phase2-optimizations, Property 29: Existing endpoints maintain contracts
        Validates: Requirements 8.1, 8.2
        """
        # Build valid URL
        url = f"https://test-{domain}.com/path"
        
        # Create mock session
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            mock_response = Mock()
            mock_response.status_code = status_code
            mock_response.text = html_content
            mock_response.content = html_content.encode('utf-8')
            mock_response.cookies = {"test_cookie": "test_value"}
            mock_response.headers = {"Content-Type": "text/html"}
            mock_session.request = Mock(return_value=mock_response)
            return mock_session
        
        # Test with Phase 2 enabled
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = True
            mock_config.adaptive_retry_enabled = True
            mock_config.memory_optimization_enabled = True
            mock_config.health_monitoring_enabled = True
            mock_config.session_pool_size = 3
            mock_config.session_pool_min_threshold = 1
            mock_config.session_max_age_hours = 1
            mock_config.pool_connections = 10
            mock_config.pool_maxsize = 20
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 0.3
            mock_config.retry_high_reliability_max = 2
            mock_config.retry_medium_reliability_max = 3
            mock_config.retry_low_reliability_max = 5
            mock_config.retry_high_backoff = 1.0
            mock_config.retry_medium_backoff = 1.5
            mock_config.retry_low_backoff = 2.0
            mock_config.retry_success_rate_high = 0.9
            mock_config.retry_success_rate_medium = 0.7
            mock_config.streaming_threshold_mb = 10
            mock_config.idle_session_timeout_hours = 1
            mock_config.aggressive_cleanup_threshold = 0.8
            mock_config.cache_size_limit = 100
            mock_config.cleanup_interval_minutes = 5
            mock_config.health_auto_recovery_enabled = True
            mock_config.health_degraded_error_rate = 0.5
            mock_config.health_slow_response_multiplier = 2.0
            mock_config.health_baseline_window_size = 10
            
            wrapper_enabled = CloudScraperWrapper()
            wrapper_enabled._create_scraper = create_mock_session
            
            try:
                result_enabled = await wrapper_enabled.fetch(url)
                
                # Verify response structure (backward compatibility)
                assert hasattr(result_enabled, 'status')
                assert hasattr(result_enabled, 'html')
                assert hasattr(result_enabled, 'cookies')
                assert hasattr(result_enabled, 'headers')
                assert hasattr(result_enabled, 'cf_bypassed')
                assert hasattr(result_enabled, 'error')
                
                # Verify response values
                assert result_enabled.status == status_code
                assert result_enabled.html == html_content
                assert isinstance(result_enabled.cookies, dict)
                assert isinstance(result_enabled.headers, dict)
                assert isinstance(result_enabled.cf_bypassed, bool)
                
            finally:
                await wrapper_enabled.shutdown()
        
        # Test with Phase 2 disabled
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper_disabled = CloudScraperWrapper()
            wrapper_disabled._create_scraper = create_mock_session
            
            try:
                result_disabled = await wrapper_disabled.fetch(url)
                
                # Verify response structure is identical
                assert hasattr(result_disabled, 'status')
                assert hasattr(result_disabled, 'html')
                assert hasattr(result_disabled, 'cookies')
                assert hasattr(result_disabled, 'headers')
                assert hasattr(result_disabled, 'cf_bypassed')
                assert hasattr(result_disabled, 'error')
                
                # Verify response values are identical
                assert result_disabled.status == status_code
                assert result_disabled.html == html_content
                assert isinstance(result_disabled.cookies, dict)
                assert isinstance(result_disabled.headers, dict)
                assert isinstance(result_disabled.cf_bypassed, bool)
                
                # Verify response format is identical (backward compatibility)
                assert type(result_enabled.status) == type(result_disabled.status)
                assert type(result_enabled.html) == type(result_disabled.html)
                assert type(result_enabled.cookies) == type(result_disabled.cookies)
                assert type(result_enabled.headers) == type(result_disabled.headers)
                assert type(result_enabled.cf_bypassed) == type(result_disabled.cf_bypassed)
                
            finally:
                await wrapper_disabled.shutdown()
    
    @pytest.mark.asyncio
    @given(
        domain=st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd'), min_codepoint=97, max_codepoint=122), min_size=5, max_size=20)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_30_disabled_optimizations_fall_back_gracefully(self, domain):
        """
        Property 30: Disabled optimizations fall back gracefully
        
        For any request, when optimizations are disabled, the system should
        fall back to basic functionality without errors.
        
        Feature: cf-bypass-phase2-optimizations, Property 30: Disabled optimizations fall back gracefully
        Validates: Requirements 8.3
        """
        # Build valid URL
        url = f"https://test-{domain}.com/path"
        
        # Create mock session
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.text = "<html>Test</html>"
            mock_response.content = b"<html>Test</html>"
            mock_response.cookies = {}
            mock_response.headers = {}
            mock_session.request = Mock(return_value=mock_response)
            return mock_session
        
        # Test with all optimizations disabled
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper = CloudScraperWrapper()
            wrapper._create_scraper = create_mock_session
            
            try:
                # Should work without errors
                result = await wrapper.fetch(url)
                
                # Verify basic functionality works
                assert result.status == 200
                assert result.html == "<html>Test</html>"
                assert result.error is None
                
                # Verify managers are None when disabled
                assert wrapper.session_pool_manager is None
                assert wrapper.connection_pool_manager is None
                assert wrapper.adaptive_retry_manager is None
                assert wrapper.memory_manager is None
                
                # Verify basic health monitor is used (not enhanced)
                assert wrapper.health_monitor is not None
                assert not hasattr(wrapper.health_monitor, 'get_degraded_domains')
                
            finally:
                await wrapper.shutdown()
    
    @pytest.mark.asyncio
    @given(
        session_pool_enabled=st.booleans(),
        connection_pool_enabled=st.booleans(),
        adaptive_retry_enabled=st.booleans(),
        memory_optimization_enabled=st.booleans(),
        health_monitoring_enabled=st.booleans()
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_31_feature_flags_control_optimization_behavior(
        self, session_pool_enabled, connection_pool_enabled, adaptive_retry_enabled,
        memory_optimization_enabled, health_monitoring_enabled
    ):
        """
        Property 31: Feature flags control optimization behavior
        
        For any combination of feature flags, only enabled optimizations
        should be initialized and active.
        
        Feature: cf-bypass-phase2-optimizations, Property 31: Feature flags control optimization behavior
        Validates: Requirements 8.4
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = session_pool_enabled
            mock_config.connection_pool_enabled = connection_pool_enabled
            mock_config.adaptive_retry_enabled = adaptive_retry_enabled
            mock_config.memory_optimization_enabled = memory_optimization_enabled
            mock_config.health_monitoring_enabled = health_monitoring_enabled
            mock_config.session_pool_size = 3
            mock_config.session_pool_min_threshold = 1
            mock_config.session_max_age_hours = 1
            mock_config.pool_connections = 10
            mock_config.pool_maxsize = 20
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 0.3
            mock_config.retry_high_reliability_max = 2
            mock_config.retry_medium_reliability_max = 3
            mock_config.retry_low_reliability_max = 5
            mock_config.retry_high_backoff = 1.0
            mock_config.retry_medium_backoff = 1.5
            mock_config.retry_low_backoff = 2.0
            mock_config.retry_success_rate_high = 0.9
            mock_config.retry_success_rate_medium = 0.7
            mock_config.streaming_threshold_mb = 10
            mock_config.idle_session_timeout_hours = 1
            mock_config.aggressive_cleanup_threshold = 0.8
            mock_config.cache_size_limit = 100
            mock_config.cleanup_interval_minutes = 5
            mock_config.health_auto_recovery_enabled = True
            mock_config.health_degraded_error_rate = 0.5
            mock_config.health_slow_response_multiplier = 2.0
            mock_config.health_baseline_window_size = 10
            
            wrapper = CloudScraperWrapper()
            
            try:
                # Verify session pool manager
                if session_pool_enabled:
                    assert wrapper.session_pool_manager is not None
                else:
                    assert wrapper.session_pool_manager is None
                
                # Verify connection pool manager
                if connection_pool_enabled:
                    assert wrapper.connection_pool_manager is not None
                else:
                    assert wrapper.connection_pool_manager is None
                
                # Verify adaptive retry manager
                if adaptive_retry_enabled:
                    assert wrapper.adaptive_retry_manager is not None
                else:
                    assert wrapper.adaptive_retry_manager is None
                
                # Verify memory manager
                if memory_optimization_enabled:
                    assert wrapper.memory_manager is not None
                else:
                    assert wrapper.memory_manager is None
                
                # Verify health monitor (always present, but enhanced only if enabled)
                assert wrapper.health_monitor is not None
                if health_monitoring_enabled:
                    assert hasattr(wrapper.health_monitor, 'get_degraded_domains')
                else:
                    assert not hasattr(wrapper.health_monitor, 'get_degraded_domains')
                
            finally:
                await wrapper.shutdown()
    
    @pytest.mark.asyncio
    @given(
        domain=st.text(alphabet=st.characters(whitelist_categories=('Ll', 'Nd'), min_codepoint=97, max_codepoint=122), min_size=5, max_size=20)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_32_failed_optimizations_degrade_gracefully(self, domain):
        """
        Property 32: Failed optimizations degrade gracefully
        
        For any request, if an optimization fails, the system should continue
        to function using fallback mechanisms.
        
        Feature: cf-bypass-phase2-optimizations, Property 32: Failed optimizations degrade gracefully
        Validates: Requirements 8.5
        """
        # Build valid URL
        url = f"https://test-{domain}.com/path"
        
        # Create mock session
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.text = "<html>Test</html>"
            mock_response.content = b"<html>Test</html>"
            mock_response.cookies = {}
            mock_response.headers = {}
            mock_session.request = Mock(return_value=mock_response)
            return mock_session
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            mock_config.session_pool_size = 3
            mock_config.session_pool_min_threshold = 1
            mock_config.session_max_age_hours = 1
            
            wrapper = CloudScraperWrapper()
            wrapper.session_pool_manager.create_session_func = create_mock_session
            
            try:
                # Simulate session pool failure by making get_session return None
                original_get_session = wrapper.session_pool_manager.get_session
                wrapper.session_pool_manager.get_session = Mock(return_value=None)
                
                # Should still work by falling back to creating a new session
                wrapper._create_scraper = create_mock_session
                result = await wrapper.fetch(url)
                
                # Verify request succeeded despite pool failure
                assert result.status == 200
                assert result.html == "<html>Test</html>"
                assert result.error is None
                
                # Restore original method
                wrapper.session_pool_manager.get_session = original_get_session
                
            finally:
                await wrapper.shutdown()
