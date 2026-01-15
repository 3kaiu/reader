"""
Property-based tests for Session Pool Manager
Feature: cf-bypass-phase2-optimizations
"""
import sys
import os
import pytest
import asyncio
from hypothesis import given, strategies as st, settings, HealthCheck
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from session_pool_manager import SessionPoolManager, SessionInfo, PoolStats
import cloudscraper


class TestSessionPoolProperties:
    """Property-based tests for Session Pool Manager"""
    
    @pytest.mark.asyncio
    @given(
        domains=st.lists(st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('L', 'N'), blacklist_characters='\x00')), min_size=1, max_size=5, unique=True),
        pool_size=st.integers(min_value=1, max_value=10)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_1_pool_initialization(self, domains, pool_size):
        """
        Feature: cf-bypass-phase2-optimizations, Property 1:
        Pool initialization creates expected sessions
        
        For any configured domain list, after warmup completes, each domain
        should have a pool with size equal to the configured pool_size.
        
        Validates: Requirements 1.1
        """
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
            # Warmup all domains
            for domain in domains:
                await manager.warmup_domain(domain)
            
            # Verify each domain has correct pool size
            for domain in domains:
                actual_size = manager.get_pool_size(domain)
                assert actual_size == pool_size, \
                    f"Domain {domain} has {actual_size} sessions, expected {pool_size}"
                
                # Verify statistics
                stats = manager.get_pool_stats(domain)
                assert stats['pool_size'] == pool_size
                assert stats['total_sessions_created'] == pool_size
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    @given(
        pool_size=st.integers(min_value=2, max_value=10),
        requests=st.integers(min_value=1, max_value=5)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_2_warmed_domains_use_pool_sessions(self, pool_size, requests):
        """
        Feature: cf-bypass-phase2-optimizations, Property 2:
        Warmed domains use pool sessions
        
        For any request to a warmed domain, the session used should come from
        the pool (pool hit), not be newly created.
        
        Validates: Requirements 1.2
        """
        domain = "test.com"
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            mock_session.domain = domain
            return mock_session
        
        # Initialize and warmup
        manager = SessionPoolManager(
            pool_size=pool_size,
            min_threshold=1,
            create_session_func=create_mock_session
        )
        
        try:
            await manager.warmup_domain(domain)
            
            # Get sessions from pool
            for i in range(min(requests, pool_size)):
                session_info = manager.get_session(domain)
                assert session_info is not None, f"Request {i+1} should get session from pool"
                assert isinstance(session_info, SessionInfo)
            
            # Verify pool hits
            stats = manager.get_pool_stats(domain)
            expected_hits = min(requests, pool_size)
            assert stats['hits'] == expected_hits, \
                f"Expected {expected_hits} hits, got {stats['hits']}"
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    @given(
        pool_size=st.integers(min_value=3, max_value=10),
        sessions_to_get=st.integers(min_value=1, max_value=5)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_3_pool_replenishment_maintains_size(
        self,
        pool_size,
        sessions_to_get
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 3:
        Pool replenishment maintains size
        
        For any pool, after retrieving N sessions, the pool size should return
        to the original size within a reasonable time window.
        
        Validates: Requirements 1.3
        """
        domain = "test.com"
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            return mock_session
        
        # Initialize and warmup
        manager = SessionPoolManager(
            pool_size=pool_size,
            min_threshold=pool_size - 1,
            create_session_func=create_mock_session
        )
        
        try:
            await manager.warmup_domain(domain)
            initial_size = manager.get_pool_size(domain)
            assert initial_size == pool_size
            
            # Get sessions from pool
            retrieved_sessions = []
            for _ in range(min(sessions_to_get, pool_size)):
                session_info = manager.get_session(domain)
                if session_info:
                    retrieved_sessions.append(session_info)
            
            # Pool should be smaller now
            size_after_get = manager.get_pool_size(domain)
            assert size_after_get == pool_size - len(retrieved_sessions)
            
            # Manually trigger replenishment and wait for completion
            await manager.replenish_pool(domain)
            
            # Pool should be replenished
            final_size = manager.get_pool_size(domain)
            assert final_size == pool_size, \
                f"Pool size should be {pool_size} after replenishment, got {final_size}"
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    @given(
        pool_size=st.integers(min_value=5, max_value=10),
        min_threshold=st.integers(min_value=1, max_value=3)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_4_auto_replenishment_triggers(self, pool_size, min_threshold):
        """
        Feature: cf-bypass-phase2-optimizations, Property 4:
        Pool auto-replenishment triggers correctly
        
        For any pool, when size drops below min_threshold, replenishment
        should be triggered automatically.
        
        Validates: Requirements 1.5
        """
        domain = "test.com"
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            return mock_session
        
        # Initialize and warmup
        manager = SessionPoolManager(
            pool_size=pool_size,
            min_threshold=min_threshold,
            create_session_func=create_mock_session
        )
        
        try:
            await manager.warmup_domain(domain)
            
            # Get sessions until below threshold
            sessions_to_remove = pool_size - min_threshold + 1
            for _ in range(sessions_to_remove):
                manager.get_session(domain)
            
            # Pool should be below threshold
            size_below_threshold = manager.get_pool_size(domain)
            assert size_below_threshold < min_threshold
            
            # Wait for auto-replenishment
            await asyncio.sleep(0.5)
            
            # Pool should be replenished
            final_size = manager.get_pool_size(domain)
            assert final_size >= min_threshold, \
                f"Pool should be replenished to at least {min_threshold}, got {final_size}"
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    async def test_property_5_stale_sessions_removed(self):
        """
        Feature: cf-bypass-phase2-optimizations, Property 5:
        Stale sessions are removed
        
        For any session in the pool, if it exceeds the max age, it should be
        removed and replaced with a fresh session.
        
        Validates: Requirements 1.6
        """
        domain = "test.com"
        max_age_hours = 1
        
        # Create mock session creation function
        def create_mock_session(domain):
            mock_session = Mock(spec=cloudscraper.CloudScraper)
            return mock_session
        
        # Initialize manager
        manager = SessionPoolManager(
            pool_size=3,
            min_threshold=1,
            max_age_hours=max_age_hours,
            create_session_func=create_mock_session
        )
        
        try:
            await manager.warmup_domain(domain)
            
            # Make sessions stale by modifying their created_at time
            pool = manager.pools[domain]
            for session_info in pool:
                session_info.created_at = datetime.now() - timedelta(hours=max_age_hours + 1)
            
            # Try to return a stale session
            stale_session = pool[0]
            manager.return_session(domain, stale_session)
            
            # Stale session should not be returned to pool
            # (pool size should not increase)
            stats = manager.get_pool_stats(domain)
            assert stats['stale_sessions_removed'] > 0
        finally:
            await manager.stop()
    
    @pytest.mark.asyncio
    @given(
        pool_size=st.integers(min_value=2, max_value=10),
        operations=st.integers(min_value=1, max_value=20)
    )
    @settings(max_examples=20, deadline=None)
    async def test_property_6_pool_statistics_accurate(self, pool_size, operations):
        """
        Feature: cf-bypass-phase2-optimizations, Property 6:
        Pool statistics are accurate
        
        For any sequence of pool operations (get, return, warmup), the reported
        statistics should accurately reflect the operations performed.
        
        Validates: Requirements 1.7
        """
        domain = "test.com"
        
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
            
            # Perform operations
            hits = 0
            misses = 0
            
            for _ in range(operations):
                session_info = manager.get_session(domain)
                if session_info:
                    hits += 1
                    # Return some sessions
                    if hits % 2 == 0:
                        manager.return_session(domain, session_info)
                else:
                    misses += 1
            
            # Verify statistics
            stats = manager.get_pool_stats(domain)
            assert stats['hits'] == hits, f"Expected {hits} hits, got {stats['hits']}"
            assert stats['misses'] == misses, f"Expected {misses} misses, got {stats['misses']}"
            
            # Verify hit rate calculation
            expected_hit_rate = hits / (hits + misses) if (hits + misses) > 0 else 0.0
            assert abs(stats['hit_rate'] - expected_hit_rate) < 0.01
        finally:
            await manager.stop()
