"""
Property-Based Tests for Connection Pool Manager
Tests universal properties that should hold for all connection pool configurations.
"""
import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import Mock, MagicMock
from connection_pool_manager import ConnectionPoolManager, PoolStats


class TestConnectionPoolProperties:
    """Property-based tests for ConnectionPoolManager"""
    
    @given(
        pool_connections=st.integers(min_value=1, max_value=100),
        pool_maxsize=st.integers(min_value=1, max_value=200),
        max_retries=st.integers(min_value=0, max_value=10),
        backoff_factor=st.floats(min_value=0.0, max_value=2.0)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_7_http_adapter_has_optimal_settings(
        self, pool_connections, pool_maxsize, max_retries, backoff_factor
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 7: HTTP adapter has optimal settings
        
        For any valid connection pool configuration, the HTTP adapter should be
        configured with the specified settings and non-blocking behavior.
        
        Validates: Requirements 2.1, 2.2, 2.3
        """
        # Create connection pool manager
        manager = ConnectionPoolManager(
            pool_connections=pool_connections,
            pool_maxsize=pool_maxsize,
            max_retries=max_retries,
            backoff_factor=backoff_factor
        )
        
        # Create mock session
        mock_session = Mock()
        mock_session.mount = Mock()
        
        # Configure adapter
        manager.configure_adapter(mock_session, domain="test.com")
        
        # Verify adapter was mounted for both HTTP and HTTPS
        assert mock_session.mount.call_count == 2
        
        # Verify configuration matches
        config = manager.get_configuration()
        assert config['pool_connections'] == pool_connections
        assert config['pool_maxsize'] == pool_maxsize
        assert config['max_retries'] == max_retries
        assert config['backoff_factor'] == backoff_factor
    
    def test_property_8_connection_pool_is_non_blocking(self):
        """
        Feature: cf-bypass-phase2-optimizations, Property 8: Connection pool is non-blocking
        
        For any connection pool manager, the pool should be configured for
        non-blocking behavior to enable better concurrency.
        
        Validates: Requirements 2.5
        """
        # Create connection pool manager with default settings
        manager = ConnectionPoolManager()
        
        # Verify non-blocking configuration
        assert manager.is_non_blocking() is True
        
        # Verify configuration includes non_blocking flag
        config = manager.get_configuration()
        assert config['non_blocking'] is True
    
    @given(
        domain=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N'))),
        hits=st.integers(min_value=0, max_value=1000),
        misses=st.integers(min_value=0, max_value=1000)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_9_connection_pool_statistics_are_tracked(
        self, domain, hits, misses
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 9: Connection pool statistics are tracked
        
        For any domain and any number of connection uses, the pool should
        accurately track hits, misses, and calculate hit rate.
        
        Validates: Requirements 2.6
        """
        # Create connection pool manager with monitoring enabled
        manager = ConnectionPoolManager(enable_monitoring=True)
        
        # Record connection uses
        for _ in range(hits):
            manager.record_connection_use(domain, hit=True)
        
        for _ in range(misses):
            manager.record_connection_use(domain, hit=False)
        
        # Get statistics
        stats = manager.get_pool_stats(domain)
        
        # Verify statistics are accurate
        assert stats['pool_hits'] == hits
        assert stats['pool_misses'] == misses
        
        # Verify hit rate calculation
        total = hits + misses
        expected_hit_rate = hits / total if total > 0 else 0.0
        assert abs(stats['hit_rate'] - expected_hit_rate) < 0.001
    
    @given(
        pool_connections=st.integers(min_value=1, max_value=100),
        pool_maxsize=st.integers(min_value=1, max_value=200)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_settings_validation_detects_issues(
        self, pool_connections, pool_maxsize
    ):
        """
        Property: Settings validation detects suboptimal configurations
        
        For any connection pool configuration, the validation should detect
        and warn about suboptimal settings.
        
        Validates: Requirements 2.7
        """
        # Create connection pool manager
        manager = ConnectionPoolManager(
            pool_connections=pool_connections,
            pool_maxsize=pool_maxsize
        )
        
        # Get validation warnings
        warnings = manager.validate_settings()
        
        # Verify warnings are generated for suboptimal settings
        if pool_connections < 10:
            assert any('pool_connections' in w and 'low' in w for w in warnings)
        
        if pool_maxsize < pool_connections:
            assert any('pool_maxsize' in w and 'pool_connections' in w for w in warnings)
        
        # Only check for low pool_maxsize if it's not already caught by the previous check
        if pool_maxsize < 30 and pool_maxsize >= pool_connections:
            assert any('pool_maxsize' in w and 'low' in w for w in warnings)
    
    @given(
        domains=st.lists(
            st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('L', 'N'))),
            min_size=1,
            max_size=10,
            unique=True
        )
    )
    @settings(max_examples=20, deadline=None)
    def test_property_multiple_domains_tracked_independently(self, domains):
        """
        Property: Multiple domains are tracked independently
        
        For any set of domains, each domain's statistics should be tracked
        independently without interference.
        
        Validates: Requirements 2.6
        """
        # Create connection pool manager
        manager = ConnectionPoolManager(enable_monitoring=True)
        
        # Record different usage patterns for each domain
        for i, domain in enumerate(domains):
            hits = (i + 1) * 10  # Start from 1 to avoid zero
            misses = (i + 1) * 5
            
            for _ in range(hits):
                manager.record_connection_use(domain, hit=True)
            
            for _ in range(misses):
                manager.record_connection_use(domain, hit=False)
        
        # Verify each domain has independent statistics
        all_stats = manager.get_all_domain_stats()
        
        for i, domain in enumerate(domains):
            stats = all_stats[domain]
            expected_hits = (i + 1) * 10
            expected_misses = (i + 1) * 5
            
            assert stats['pool_hits'] == expected_hits
            assert stats['pool_misses'] == expected_misses
    
    @given(
        errors=st.integers(min_value=0, max_value=100)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_connection_errors_tracked(self, errors):
        """
        Property: Connection errors are tracked accurately
        
        For any number of connection errors, the manager should track
        them accurately per domain and globally.
        
        Validates: Requirements 2.6
        """
        # Create connection pool manager
        manager = ConnectionPoolManager(enable_monitoring=True)
        
        domain = "test.com"
        
        # Record connection errors
        for _ in range(errors):
            manager.record_connection_error(domain)
        
        # Verify error tracking
        stats = manager.get_pool_stats(domain)
        assert stats['connection_errors'] == errors
        
        # Verify global stats
        global_stats = manager.get_pool_stats()
        assert global_stats['connection_errors'] == errors
