"""
Property-Based Tests for Enhanced Health Monitor
Tests universal properties that should hold for all health monitoring configurations.
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import Mock
from health_monitor import EnhancedHealthMonitor, DomainHealth


class TestHealthMonitorProperties:
    """Property-based tests for EnhancedHealthMonitor"""
    
    @given(
        domain=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N'))),
        successes=st.integers(min_value=0, max_value=100),
        errors=st.integers(min_value=0, max_value=100),
        durations=st.lists(st.floats(min_value=0.1, max_value=5.0), min_size=1, max_size=100)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_21_performance_metrics_tracked_per_domain(
        self, domain, successes, errors, durations
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 21: Performance metrics are tracked per domain
        
        For any domain and any number of requests, the monitor should
        accurately track error rate and response time.
        
        Validates: Requirements 5.1
        """
        # Create monitor
        monitor = EnhancedHealthMonitor()
        
        # Record successes with durations
        for i in range(min(successes, len(durations))):
            monitor.record_success(domain, durations[i % len(durations)])
        
        # Record errors
        for _ in range(errors):
            monitor.record_error(domain, "test error")
        
        # Get health stats
        stats = monitor.get_health_stats(domain)
        
        # Verify tracking
        assert stats['success_count'] == min(successes, len(durations))
        assert stats['error_count'] == errors
        assert stats['total_requests'] == min(successes, len(durations)) + errors
        
        # Verify error rate calculation
        total = min(successes, len(durations)) + errors
        if total > 0:
            expected_error_rate = errors / total
            assert abs(stats['error_rate'] - expected_error_rate) < 0.001
    
    @given(
        errors=st.integers(min_value=51, max_value=100),
        successes=st.integers(min_value=0, max_value=49)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_22_high_error_rate_marks_domain_as_degraded(
        self, errors, successes
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 22: High error rate marks domain as degraded
        
        For any domain with error rate >50%, the domain should be
        marked as degraded.
        
        Validates: Requirements 5.2
        """
        domain = "degraded-domain.com"
        
        # Create monitor with 50% threshold
        monitor = EnhancedHealthMonitor(degraded_error_rate_threshold=0.5)
        
        # Record requests to achieve >50% error rate
        for _ in range(successes):
            monitor.record_success(domain, 1.0)
        
        for _ in range(errors):
            monitor.record_error(domain, "test error")
        
        # Check health
        health = monitor.check_domain_health(domain)
        
        # Verify degradation detection
        total = successes + errors
        if total > 0:
            error_rate = errors / total
            if error_rate > 0.5:
                assert health.is_degraded
                assert health.status in ["degraded", "critical"]
    
    def test_property_24_slow_responses_trigger_pool_refresh(self):
        """
        Feature: cf-bypass-phase2-optimizations, Property 24: Slow responses trigger pool refresh
        
        For any domain with 200% increase in response time, the domain
        should be marked as degraded.
        
        Validates: Requirements 5.4
        """
        domain = "slow-domain.com"
        
        # Create monitor with 2.0x multiplier
        monitor = EnhancedHealthMonitor(slow_response_multiplier=2.0, baseline_window_size=10)
        
        # Establish baseline with fast responses (1.0s)
        # Need exactly baseline_window_size requests to establish baseline
        for _ in range(10):
            monitor.record_success(domain, 1.0)
        
        # Verify baseline is established at 1.0s
        stats = monitor._domain_stats[domain]
        assert stats['baseline_response_time'] == 1.0
        
        # Now record slow responses (3.0s = 200% increase from 1.0s baseline)
        # Add enough to fill the response_times window
        for _ in range(10):
            monitor.record_success(domain, 3.0)
        
        # Check health after slow responses
        health = monitor.check_domain_health(domain)
        
        # After 10 fast + 10 slow requests:
        # - baseline_response_time = 1.0s (established from first 10 requests)
        # - recent_avg = last 10 requests = 3.0s
        # - response_time_increase = (3.0 - 1.0) / 1.0 = 200% = 2.0x
        # - This should trigger degradation since 2.0 >= (2.0 - 1.0) = 1.0
        
        assert health.baseline_response_time == 1.0
        recent_avg = monitor.get_recent_avg_response_time(domain)
        assert recent_avg == 3.0
        
        # Verify degradation was detected
        assert health.is_degraded
        assert health.status in ["degraded", "critical"]
    
    @given(
        domain=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N')))
    )
    @settings(max_examples=20, deadline=None)
    def test_property_23_degraded_domains_trigger_session_reset(self, domain):
        """
        Feature: cf-bypass-phase2-optimizations, Property 23: Degraded domains trigger session reset
        
        For any degraded domain, recovery should be triggered automatically.
        
        Validates: Requirements 5.3
        """
        # Create monitor with auto-recovery enabled
        monitor = EnhancedHealthMonitor(
            degraded_error_rate_threshold=0.5,
            enable_auto_recovery=True
        )
        
        # Make domain degraded (100% error rate)
        for _ in range(10):
            monitor.record_error(domain, "test error")
        
        # Mock recovery function
        recovery_called = []
        def recovery_func(d):
            recovery_called.append(d)
        
        # Trigger recovery
        result = monitor.trigger_recovery(domain, recovery_func)
        
        # Verify recovery was triggered
        assert result is True
        assert domain in recovery_called
        
        # Verify recovery was recorded
        stats = monitor.get_health_stats(domain)
        assert stats['recovery_count'] == 1
        assert stats['last_recovery'] is not None
    
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
        
        For any set of domains, each domain's health should be tracked
        independently without interference.
        
        Validates: Requirements 5.1
        """
        # Create monitor
        monitor = EnhancedHealthMonitor()
        
        # Record different patterns for each domain
        for i, domain in enumerate(domains):
            successes = (i + 1) * 5
            errors = i * 2
            
            for _ in range(successes):
                monitor.record_success(domain, 1.0)
            
            for _ in range(errors):
                monitor.record_error(domain, "test error")
        
        # Verify each domain has independent statistics
        all_stats = monitor.get_health_stats()
        
        for i, domain in enumerate(domains):
            stats = all_stats[domain]
            expected_successes = (i + 1) * 5
            expected_errors = i * 2
            
            assert stats['success_count'] == expected_successes
            assert stats['error_count'] == expected_errors
    
    def test_property_healthy_domains_dont_trigger_recovery(self):
        """
        Property: Healthy domains don't trigger recovery
        
        For any healthy domain (error rate <50%), recovery should not
        be triggered.
        
        Validates: Requirements 5.2, 5.3
        """
        domain = "healthy-domain.com"
        
        # Create monitor
        monitor = EnhancedHealthMonitor(enable_auto_recovery=True)
        
        # Make domain healthy (10% error rate)
        for _ in range(90):
            monitor.record_success(domain, 1.0)
        
        for _ in range(10):
            monitor.record_error(domain, "test error")
        
        # Mock recovery function
        recovery_called = []
        def recovery_func(d):
            recovery_called.append(d)
        
        # Try to trigger recovery
        result = monitor.trigger_recovery(domain, recovery_func)
        
        # Verify recovery was NOT triggered
        assert result is False
        assert len(recovery_called) == 0
    
    def test_property_get_degraded_domains_returns_only_degraded(self):
        """
        Property: get_degraded_domains returns only degraded domains
        
        The method should return only domains that are actually degraded.
        
        Validates: Requirements 5.2
        """
        # Create monitor
        monitor = EnhancedHealthMonitor(degraded_error_rate_threshold=0.5)
        
        # Create healthy domain
        for _ in range(90):
            monitor.record_success("healthy.com", 1.0)
        for _ in range(10):
            monitor.record_error("healthy.com", "error")
        
        # Create degraded domain
        for _ in range(10):
            monitor.record_success("degraded.com", 1.0)
        for _ in range(90):
            monitor.record_error("degraded.com", "error")
        
        # Get degraded domains
        degraded = monitor.get_degraded_domains()
        
        # Verify only degraded domain is returned
        assert "degraded.com" in degraded
        assert "healthy.com" not in degraded
    
    def test_property_reset_domain_stats_clears_performance_data(self):
        """
        Property: reset_domain_stats clears performance data
        
        Resetting domain stats should clear performance metrics but
        keep recovery history.
        
        Validates: Requirements 5.3
        """
        domain = "test-domain.com"
        
        # Create monitor
        monitor = EnhancedHealthMonitor()
        
        # Record some data
        for _ in range(50):
            monitor.record_success(domain, 1.0)
        for _ in range(50):
            monitor.record_error(domain, "error")
        
        # Trigger recovery to set recovery count
        monitor._domain_stats[domain]['recovery_count'] = 5
        
        # Reset stats
        monitor.reset_domain_stats(domain)
        
        # Verify performance data cleared
        stats = monitor.get_health_stats(domain)
        assert stats['success_count'] == 0
        assert stats['error_count'] == 0
        assert stats['status'] == 'healthy'
        
        # Verify recovery history kept
        assert stats['recovery_count'] == 5
