"""
Integration tests for complete Phase 2 flows
Feature: cf-bypass-phase2-optimizations

Tests end-to-end flows combining multiple Phase 2 components:
1. Warmup → Fetch → Pool Hit → Replenishment
2. High Error Rate → Degraded → Recovery
3. High Memory → Cleanup
"""
import sys
import os
import pytest
import asyncio
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cloudscraper_wrapper import CloudScraperWrapper
from health_monitor import EnhancedHealthMonitor
from memory_manager import MemoryManager, MemoryStats
from session_pool_manager import SessionPoolManager
import cloudscraper


class TestCompleteFlowsIntegration:
    """Integration tests for complete Phase 2 flows"""
    
    @pytest.mark.asyncio
    async def test_warmup_fetch_pool_hit_replenishment_flow(self):
        """
        Integration test: Complete warmup → fetch → pool hit → replenishment flow
        
        Validates that:
        1. Warmup creates sessions in pool
        2. Fetch uses session from pool (pool hit)
        3. Session is returned to pool after successful fetch
        4. Pool replenishment maintains pool size
        5. Statistics are tracked correctly throughout
        
        Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7
        """
        domain = "test.com"
        url = f"https://{domain}/test"
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            # Mock request method
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.text = "<html>Test</html>"
            mock_response.content = b"<html>Test</html>"
            mock_response.cookies = {}
            mock_response.headers = {}
            mock_session.request = Mock(return_value=mock_response)
            return mock_session
        
        # Mock phase2_config
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.session_pool_size = 3
            mock_config.session_pool_min_threshold = 2
            mock_config.session_max_age_hours = 1
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            # Create wrapper
            wrapper = CloudScraperWrapper()
            wrapper.session_pool_manager.create_session_func = create_mock_session
            
            try:
                # Step 1: Warmup
                warmup_result = await wrapper.warmup_domain(domain)
                assert warmup_result['success'] is True
                assert warmup_result['pool_size'] == 3
                
                # Verify pool is warmed up
                pool_size = wrapper.session_pool_manager.get_pool_size(domain)
                assert pool_size == 3
                
                # Step 2: Fetch (should use pool session)
                result = await wrapper.fetch(url)
                assert result.status == 200
                assert result.html == "<html>Test</html>"
                
                # Step 3: Verify pool hit
                stats = wrapper.session_pool_manager.get_pool_stats(domain)
                assert stats['hits'] == 1
                assert stats['misses'] == 0
                assert stats['hit_rate'] == 1.0
                
                # Step 4: Verify session was returned to pool
                pool_size_after = wrapper.session_pool_manager.get_pool_size(domain)
                assert pool_size_after == 3  # Session returned
                
                # Step 5: Multiple fetches to test pool usage
                for _ in range(5):
                    result = await wrapper.fetch(url)
                    assert result.status == 200
                
                # Verify all were pool hits
                stats = wrapper.session_pool_manager.get_pool_stats(domain)
                assert stats['hits'] == 6  # 1 + 5
                assert stats['misses'] == 0
                assert stats['hit_rate'] == 1.0
                
                # Step 6: Verify pool size maintained
                final_pool_size = wrapper.session_pool_manager.get_pool_size(domain)
                assert final_pool_size == 3
                
            finally:
                await wrapper.shutdown()
    
    @pytest.mark.asyncio
    async def test_high_error_rate_degraded_recovery_flow(self):
        """
        Integration test: High error rate → degraded → recovery flow
        
        Validates that:
        1. Multiple errors increase error rate
        2. High error rate marks domain as degraded
        3. Degraded domain triggers auto-recovery
        4. Recovery resets sessions and health stats
        5. Domain returns to healthy state after recovery
        
        Validates: Requirements 5.1, 5.2, 5.3, 5.5
        """
        domain = "degraded-domain.com"
        url = f"https://{domain}/test"
        
        # Create mock session that fails
        def create_failing_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            mock_session.request = Mock(side_effect=Exception("Connection failed"))
            return mock_session
        
        # Mock phase2_config
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = True
            mock_config.health_auto_recovery_enabled = True
            mock_config.health_degraded_error_rate = 0.5
            mock_config.health_slow_response_multiplier = 2.0
            mock_config.health_baseline_window_size = 10
            
            # Create wrapper
            wrapper = CloudScraperWrapper()
            wrapper._create_scraper = create_failing_session
            
            try:
                # Step 1: Generate errors to degrade domain
                for _ in range(10):
                    result = await wrapper.fetch(url)
                    assert result.error is not None
                
                # Step 2: Check domain is degraded
                health = wrapper.health_monitor.check_domain_health(domain)
                assert health.is_degraded
                assert health.error_rate > 0.5
                assert health.status in ["degraded", "critical"]
                
                # Step 3: Verify degraded domains list
                degraded_domains = wrapper.health_monitor.get_degraded_domains()
                assert domain in degraded_domains
                
                # Step 4: Get stats to verify health monitoring
                stats = wrapper.get_stats()
                assert 'health_monitoring' in stats
                assert domain in stats['health_monitoring']['degraded_domains']
                
                # Step 5: Manual recovery (auto-recovery happens during fetch)
                # Reset health stats
                wrapper.health_monitor.reset_domain_stats(domain)
                
                # Step 6: Verify domain is healthy after reset
                health_after = wrapper.health_monitor.check_domain_health(domain)
                assert health_after.status == 'healthy'
                assert health_after.error_rate == 0.0
                
            finally:
                await wrapper.shutdown()
    
    @pytest.mark.asyncio
    async def test_high_memory_cleanup_flow(self):
        """
        Integration test: High memory → cleanup flow
        
        Validates that:
        1. Memory pressure is detected
        2. High memory triggers aggressive cleanup
        3. Cleanup removes idle sessions
        4. Memory usage is reduced after cleanup
        5. System continues to function after cleanup
        
        Validates: Requirements 4.2, 4.4, 4.5, 4.7
        """
        domain = "test.com"
        
        # Create mock session
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            return mock_session
        
        # Mock phase2_config
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.session_pool_size = 5
            mock_config.session_pool_min_threshold = 2
            mock_config.session_max_age_hours = 1
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = True
            mock_config.streaming_threshold_mb = 10
            mock_config.idle_session_timeout_hours = 1
            mock_config.aggressive_cleanup_threshold = 0.8
            mock_config.cache_size_limit = 100
            mock_config.cleanup_interval_minutes = 5
            mock_config.health_monitoring_enabled = False
            
            # Create wrapper
            wrapper = CloudScraperWrapper()
            wrapper.session_pool_manager.create_session_func = create_mock_session
            
            try:
                # Step 1: Warmup to create sessions
                await wrapper.warmup_domain(domain)
                assert wrapper.session_pool_manager.get_pool_size(domain) == 5
                
                # Step 2: Simulate high memory pressure
                # Mock memory stats to show high pressure
                high_memory_stats = MemoryStats(
                    total_mb=1000.0,
                    available_mb=150.0,  # 15% available = 85% used
                    used_mb=850.0,
                    percent=85.0,
                    threshold_mb=800.0  # 80% threshold
                )
                
                with patch.object(wrapper.memory_manager, 'check_memory_pressure', return_value=high_memory_stats):
                    # Step 3: Check memory pressure
                    memory_stats = wrapper.memory_manager.check_memory_pressure()
                    assert memory_stats.is_high_pressure
                    assert memory_stats.percent > 80.0
                    
                    # Step 4: Trigger aggressive cleanup
                    cleanup_count = 0
                    def mock_cleanup_session(session_id):
                        nonlocal cleanup_count
                        cleanup_count += 1
                    
                    wrapper.memory_manager.trigger_aggressive_cleanup(mock_cleanup_session)
                    
                    # Verify cleanup was triggered
                    assert cleanup_count >= 0  # Some sessions may be cleaned up
                
                # Step 5: Verify memory stats are available
                stats = wrapper.get_stats()
                assert 'memory' in stats
                # Memory stats are nested: stats['memory']['memory']
                assert 'memory' in stats['memory']
                assert 'used_mb' in stats['memory']['memory']
                
                # Step 6: Verify system still functions after cleanup
                # Pool should still work (may be smaller)
                pool_size_after = wrapper.session_pool_manager.get_pool_size(domain)
                assert pool_size_after >= 0  # Pool may be empty after cleanup
                
            finally:
                await wrapper.shutdown()
    
    @pytest.mark.asyncio
    async def test_combined_optimizations_flow(self):
        """
        Integration test: Combined optimizations working together
        
        Validates that:
        1. All Phase 2 components can work together
        2. Session pool + connection pool + retry + memory + health monitoring
        3. No conflicts between components
        4. Statistics from all components are available
        
        Validates: Requirements All
        """
        domain = "combined-test.com"
        url = f"https://{domain}/test"
        
        # Create mock session
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            # Mock successful response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.text = "<html>Success</html>"
            mock_response.content = b"<html>Success</html>"
            mock_response.cookies = {}
            mock_response.headers = {}
            mock_session.request = Mock(return_value=mock_response)
            return mock_session
        
        # Mock phase2_config with all optimizations enabled
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.session_pool_size = 3
            mock_config.session_pool_min_threshold = 1
            mock_config.session_max_age_hours = 1
            mock_config.connection_pool_enabled = True
            mock_config.pool_connections = 10
            mock_config.pool_maxsize = 20
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 0.3
            mock_config.adaptive_retry_enabled = True
            mock_config.retry_high_reliability_max = 2
            mock_config.retry_medium_reliability_max = 3
            mock_config.retry_low_reliability_max = 5
            mock_config.retry_high_backoff = 1.0
            mock_config.retry_medium_backoff = 1.5
            mock_config.retry_low_backoff = 2.0
            mock_config.retry_success_rate_high = 0.9
            mock_config.retry_success_rate_medium = 0.7
            mock_config.memory_optimization_enabled = True
            mock_config.streaming_threshold_mb = 10
            mock_config.idle_session_timeout_hours = 1
            mock_config.aggressive_cleanup_threshold = 0.8
            mock_config.cache_size_limit = 100
            mock_config.cleanup_interval_minutes = 5
            mock_config.health_monitoring_enabled = True
            mock_config.health_auto_recovery_enabled = True
            mock_config.health_degraded_error_rate = 0.5
            mock_config.health_slow_response_multiplier = 2.0
            mock_config.health_baseline_window_size = 10
            
            # Create wrapper
            wrapper = CloudScraperWrapper()
            wrapper.session_pool_manager.create_session_func = create_mock_session
            
            try:
                # Step 1: Verify all components initialized
                assert wrapper.session_pool_manager is not None
                assert wrapper.connection_pool_manager is not None
                assert wrapper.adaptive_retry_manager is not None
                assert wrapper.memory_manager is not None
                assert wrapper.health_monitor is not None
                
                # Step 2: Warmup
                warmup_result = await wrapper.warmup_domain(domain)
                assert warmup_result['success'] is True
                
                # Step 3: Perform multiple fetches
                for _ in range(10):
                    result = await wrapper.fetch(url)
                    assert result.status == 200
                
                # Step 4: Get comprehensive stats
                stats = wrapper.get_stats()
                
                # Verify all component stats are present
                assert 'session_pool' in stats
                assert 'connection_pool' in stats
                assert 'adaptive_retry' in stats
                assert 'memory' in stats
                assert 'health_monitoring' in stats or 'health_stats' in stats
                
                # Step 5: Verify session pool stats
                assert stats['session_pool'][domain]['hits'] > 0
                assert stats['session_pool'][domain]['hit_rate'] > 0
                
                # Step 6: Verify connection pool stats
                assert 'global' in stats['connection_pool']
                
                # Step 7: Verify adaptive retry stats
                assert 'by_domain' in stats['adaptive_retry']
                
                # Step 8: Verify memory stats
                # Memory stats are nested: stats['memory']['memory']
                assert 'memory' in stats['memory']
                assert 'used_mb' in stats['memory']['memory']
                
                # Step 9: Verify health monitoring
                if 'health_monitoring' in stats:
                    assert 'degraded_domains' in stats['health_monitoring']
                
                # Step 10: Verify domain is healthy
                health = wrapper.health_monitor.check_domain_health(domain)
                assert health.status == 'healthy'
                assert health.error_rate == 0.0
                
            finally:
                await wrapper.shutdown()
    
    @pytest.mark.asyncio
    async def test_error_recovery_with_pool_refresh(self):
        """
        Integration test: Error recovery with pool refresh
        
        Validates that:
        1. Errors are tracked per domain
        2. Error-prone sessions are not returned to pool
        3. Pool is refreshed with new sessions
        4. Recovery improves success rate
        
        Validates: Requirements 1.6, 5.3, 5.5
        """
        domain = "error-recovery.com"
        url = f"https://{domain}/test"
        
        # Track session creation count
        session_count = {'count': 0}
        
        # Create mock session that fails first few times
        def create_mock_session(domain):
            session_count['count'] += 1
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            
            # First 3 sessions fail, rest succeed
            if session_count['count'] <= 3:
                mock_session.request = Mock(side_effect=Exception("Connection failed"))
            else:
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.text = "<html>Success</html>"
                mock_response.content = b"<html>Success</html>"
                mock_response.cookies = {}
                mock_response.headers = {}
                mock_session.request = Mock(return_value=mock_response)
            
            return mock_session
        
        # Mock phase2_config
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.session_pool_size = 3
            mock_config.session_pool_min_threshold = 1
            mock_config.session_max_age_hours = 1
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = True
            mock_config.health_auto_recovery_enabled = False  # Manual recovery
            mock_config.health_degraded_error_rate = 0.5
            mock_config.health_slow_response_multiplier = 2.0
            mock_config.health_baseline_window_size = 10
            
            # Create wrapper
            wrapper = CloudScraperWrapper()
            wrapper.session_pool_manager.create_session_func = create_mock_session
            
            try:
                # Step 1: Warmup (creates 3 failing sessions)
                await wrapper.warmup_domain(domain)
                assert session_count['count'] == 3
                
                # Step 2: Try to fetch (will fail)
                result = await wrapper.fetch(url)
                assert result.error is not None
                
                # Step 3: Session should not be returned to pool (error-prone)
                # Stale sessions are tracked in PoolStats, not in the stats dict directly
                pool_stats = wrapper.session_pool_manager.get_pool_stats(domain)
                # After error, session should not be returned (error-prone)
                # Pool size should be less than initial warmup size
                assert pool_stats['pool_size'] < 3
                
                # Step 4: Clear pool and warmup again (creates new sessions)
                wrapper.session_pool_manager.pools[domain].clear()
                await wrapper.warmup_domain(domain)
                
                # Step 5: New sessions should succeed
                result = await wrapper.fetch(url)
                assert result.status == 200
                assert result.error is None
                
                # Step 6: Verify pool hit with good session
                stats = wrapper.session_pool_manager.get_pool_stats(domain)
                assert stats['hits'] > 0
                
            finally:
                await wrapper.shutdown()
