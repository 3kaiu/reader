"""
Integration tests for Session Pool Manager
Feature: cf-bypass-phase2-optimizations
"""
import sys
import os
import pytest
import asyncio
from unittest.mock import Mock, patch
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from session_pool_manager import SessionPoolManager, SessionInfo
from cloudscraper_wrapper import CloudScraperWrapper
import cloudscraper


class TestSessionPoolIntegration:
    """Integration tests for Session Pool Manager"""
    
    @pytest.mark.asyncio
    async def test_warmup_fetch_pool_hit_flow(self):
        """
        Integration test: warmup → fetch → pool hit flow
        
        Validates that:
        1. Warmup creates sessions in pool
        2. Fetch uses session from pool (pool hit)
        3. Session is returned to pool after use
        4. Statistics are tracked correctly
        
        Validates: Requirements 1.1, 1.2, 1.4, 1.7
        """
        domain = "test.com"
        pool_size = 3
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            return mock_session
        
        # Initialize manager
        manager = SessionPoolManager(
            pool_size=pool_size,
            min_threshold=1,
            create_session_func=create_mock_session
        )
        
        try:
            # Step 1: Warmup
            await manager.warmup_domain(domain)
            
            # Verify pool is warmed up
            assert manager.get_pool_size(domain) == pool_size
            stats = manager.get_pool_stats(domain)
            assert stats['pool_size'] == pool_size
            assert stats['total_sessions_created'] == pool_size
            assert stats['hits'] == 0
            assert stats['misses'] == 0
            
            # Step 2: Get session (simulating fetch)
            session_info = manager.get_session(domain)
            assert session_info is not None
            assert isinstance(session_info, SessionInfo)
            
            # Verify pool hit
            stats = manager.get_pool_stats(domain)
            assert stats['hits'] == 1
            assert stats['misses'] == 0
            assert stats['pool_size'] == pool_size - 1  # One session removed
            
            # Step 3: Simulate successful request
            session_info.record_success()
            
            # Step 4: Return session to pool
            manager.return_session(domain, session_info)
            
            # Verify session returned
            assert manager.get_pool_size(domain) == pool_size
            
            # Step 5: Get another session (should be pool hit again)
            session_info2 = manager.get_session(domain)
            assert session_info2 is not None
            
            # Verify statistics
            stats = manager.get_pool_stats(domain)
            assert stats['hits'] == 2
            assert stats['misses'] == 0
            assert stats['hit_rate'] == 1.0  # 100% hit rate
            
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    async def test_pool_miss_triggers_replenishment(self):
        """
        Integration test: pool miss triggers replenishment
        
        Validates that:
        1. Empty pool returns None (pool miss)
        2. Pool miss triggers automatic replenishment
        3. Pool is replenished to target size
        
        Validates: Requirements 1.2, 1.3, 1.5
        """
        domain = "test.com"
        pool_size = 3
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            return mock_session
        
        # Initialize manager with empty pool
        manager = SessionPoolManager(
            pool_size=pool_size,
            min_threshold=2,
            create_session_func=create_mock_session
        )
        
        try:
            # Pool is empty initially
            assert manager.get_pool_size(domain) == 0
            
            # Get session from empty pool (should be miss)
            session_info = manager.get_session(domain)
            assert session_info is None
            
            # Verify pool miss
            stats = manager.get_pool_stats(domain)
            assert stats['hits'] == 0
            assert stats['misses'] == 1
            
            # Wait for automatic replenishment
            await asyncio.sleep(0.5)
            
            # Pool should be replenished
            assert manager.get_pool_size(domain) == pool_size
            
            # Now get session should succeed
            session_info = manager.get_session(domain)
            assert session_info is not None
            
            # Verify pool hit
            stats = manager.get_pool_stats(domain)
            assert stats['hits'] == 1
            assert stats['misses'] == 1
            
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    async def test_concurrent_requests_use_different_sessions(self):
        """
        Integration test: concurrent requests use different sessions
        
        Validates that:
        1. Multiple concurrent requests each get their own session
        2. Pool size decreases as sessions are taken
        3. All sessions can be returned to pool
        
        Validates: Requirements 1.2, 1.3
        """
        domain = "test.com"
        pool_size = 5
        concurrent_requests = 3
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            return mock_session
        
        # Initialize and warmup
        manager = SessionPoolManager(
            pool_size=pool_size,
            min_threshold=1,
            create_session_func=create_mock_session
        )
        
        try:
            await manager.warmup_domain(domain)
            
            # Get multiple sessions concurrently
            sessions = []
            for _ in range(concurrent_requests):
                session_info = manager.get_session(domain)
                assert session_info is not None
                sessions.append(session_info)
            
            # Verify pool size decreased
            assert manager.get_pool_size(domain) == pool_size - concurrent_requests
            
            # Verify all sessions are different
            session_ids = [s.session_id for s in sessions]
            assert len(set(session_ids)) == concurrent_requests
            
            # Return all sessions
            for session_info in sessions:
                session_info.record_success()
                manager.return_session(domain, session_info)
            
            # Verify pool size restored
            assert manager.get_pool_size(domain) == pool_size
            
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    async def test_error_prone_session_not_returned_to_pool(self):
        """
        Integration test: error-prone sessions are not returned to pool
        
        Validates that:
        1. Sessions with high error rate are detected
        2. Error-prone sessions are not returned to pool
        3. Pool statistics track removed sessions
        
        Validates: Requirements 1.6, 1.7
        """
        domain = "test.com"
        pool_size = 3
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            return mock_session
        
        # Initialize and warmup
        manager = SessionPoolManager(
            pool_size=pool_size,
            min_threshold=1,
            create_session_func=create_mock_session
        )
        
        try:
            await manager.warmup_domain(domain)
            
            # Get session
            session_info = manager.get_session(domain)
            assert session_info is not None
            
            # Simulate multiple errors (make it error-prone)
            for _ in range(10):
                session_info.record_error()
            
            # Try to return error-prone session
            initial_pool_size = manager.get_pool_size(domain)
            manager.return_session(domain, session_info)
            
            # Session should not be returned (pool size unchanged)
            assert manager.get_pool_size(domain) == initial_pool_size
            
            # Verify statistics
            stats = manager.get_pool_stats(domain)
            assert stats['stale_sessions_removed'] > 0
            
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    async def test_warmup_api_endpoint_integration(self):
        """
        Integration test: warmup API endpoint
        
        Validates that:
        1. Warmup endpoint can be called
        2. Warmup creates sessions in pool
        3. Warmup returns correct statistics
        
        Validates: Requirements 1.4
        """
        domain = "test.com"
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            return mock_session
        
        # Create wrapper with session pool enabled
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.session_pool_size = 3
            mock_config.session_pool_min_threshold = 1
            mock_config.session_max_age_hours = 1
            # Add connection pool config to avoid validation errors
            mock_config.connection_pool_enabled = True
            mock_config.pool_connections = 20
            mock_config.pool_maxsize = 50
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 0.3
            
            wrapper = CloudScraperWrapper()
            wrapper.session_pool_manager.create_session_func = create_mock_session
            
            try:
                # Call warmup method (simulating API endpoint)
                result = await wrapper.warmup_domain(domain)
                
                # Verify result
                assert result['success'] is True
                assert result['domain'] == domain
                assert result['pool_size'] == 3
                assert 'warmup_time' in result
                assert 'stats' in result
                
                # Verify pool is warmed up
                assert wrapper.session_pool_manager.get_pool_size(domain) == 3
                
            finally:
                await wrapper.shutdown()
