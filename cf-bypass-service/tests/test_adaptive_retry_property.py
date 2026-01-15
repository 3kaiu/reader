"""
Property-Based Tests for Adaptive Retry Manager
Tests universal properties that should hold for all retry configurations.
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from adaptive_retry_manager import AdaptiveRetryManager, RetryConfig


class TestAdaptiveRetryProperties:
    """Property-based tests for AdaptiveRetryManager"""
    
    @given(
        domain=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N'))),
        successes=st.integers(min_value=0, max_value=1000),
        failures=st.integers(min_value=0, max_value=1000)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_10_success_rates_tracked_accurately(
        self, domain, successes, failures
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 10: Success rates are tracked accurately
        
        For any domain and any number of attempts, the manager should
        accurately track success rate.
        
        Validates: Requirements 3.1
        """
        # Create manager
        manager = AdaptiveRetryManager(enable_monitoring=True)
        
        # Record attempts
        for _ in range(successes):
            manager.record_attempt(domain, success=True)
        
        for _ in range(failures):
            manager.record_attempt(domain, success=False)
        
        # Get success rate
        success_rate = manager.get_success_rate(domain)
        
        # Calculate expected success rate
        total = successes + failures
        if total == 0:
            expected_rate = 1.0  # Default for new domains
        else:
            expected_rate = successes / total
        
        # Verify accuracy
        assert abs(success_rate - expected_rate) < 0.001
        
        # Verify stats
        stats = manager.get_retry_stats(domain)
        assert stats['success_count'] == successes
        assert stats['failure_count'] == failures
        assert stats['total_attempts'] == total
    
    @given(
        successes=st.integers(min_value=91, max_value=100),
        failures=st.integers(min_value=0, max_value=9)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_11_high_reliability_uses_minimal_retries(
        self, successes, failures
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 11: High reliability domains use minimal retries
        
        For any domain with >90% success rate, the manager should
        use minimal retries (2 attempts).
        
        Validates: Requirements 3.2
        """
        domain = "high-reliability.com"
        
        # Create manager with default settings
        manager = AdaptiveRetryManager(
            high_reliability_max=2,
            success_rate_high=0.9
        )
        
        # Record attempts to achieve >90% success rate
        for _ in range(successes):
            manager.record_attempt(domain, success=True)
        
        for _ in range(failures):
            manager.record_attempt(domain, success=False)
        
        # Verify success rate is high
        success_rate = manager.get_success_rate(domain)
        assume(success_rate > 0.9)  # Ensure we're testing high reliability
        
        # Get retry config
        config = manager.get_retry_config(domain)
        
        # Verify minimal retries
        assert config.max_retries == 2
        assert manager.get_reliability_tier(domain) == "high"
    
    @given(
        successes=st.integers(min_value=70, max_value=89),
        failures=st.integers(min_value=11, max_value=30)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_12_medium_reliability_uses_moderate_retries(
        self, successes, failures
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 12: Medium reliability domains use moderate retries
        
        For any domain with 70-90% success rate, the manager should
        use moderate retries (3 attempts).
        
        Validates: Requirements 3.3
        """
        domain = "medium-reliability.com"
        
        # Create manager with default settings
        manager = AdaptiveRetryManager(
            medium_reliability_max=3,
            success_rate_high=0.9,
            success_rate_medium=0.7
        )
        
        # Record attempts to achieve 70-90% success rate
        for _ in range(successes):
            manager.record_attempt(domain, success=True)
        
        for _ in range(failures):
            manager.record_attempt(domain, success=False)
        
        # Verify success rate is medium
        success_rate = manager.get_success_rate(domain)
        assume(0.7 <= success_rate < 0.9)  # Ensure we're testing medium reliability (< 0.9, not <=)
        
        # Get retry config
        config = manager.get_retry_config(domain)
        
        # Verify moderate retries
        assert config.max_retries == 3
        assert manager.get_reliability_tier(domain) == "medium"
    
    @given(
        successes=st.integers(min_value=0, max_value=69),
        failures=st.integers(min_value=31, max_value=100)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_13_low_reliability_uses_aggressive_retries(
        self, successes, failures
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 13: Low reliability domains use aggressive retries
        
        For any domain with <70% success rate, the manager should
        use aggressive retries (5 attempts).
        
        Validates: Requirements 3.4
        """
        domain = "low-reliability.com"
        
        # Create manager with default settings
        manager = AdaptiveRetryManager(
            low_reliability_max=5,
            success_rate_medium=0.7
        )
        
        # Record attempts to achieve <70% success rate
        for _ in range(successes):
            manager.record_attempt(domain, success=True)
        
        for _ in range(failures):
            manager.record_attempt(domain, success=False)
        
        # Verify success rate is low
        success_rate = manager.get_success_rate(domain)
        assume(success_rate < 0.7)  # Ensure we're testing low reliability
        
        # Get retry config
        config = manager.get_retry_config(domain)
        
        # Verify aggressive retries
        assert config.max_retries == 5
        assert manager.get_reliability_tier(domain) == "low"
    
    @given(
        high_backoff=st.floats(min_value=0.5, max_value=2.0),
        medium_backoff=st.floats(min_value=1.0, max_value=3.0),
        low_backoff=st.floats(min_value=1.5, max_value=5.0)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_14_backoff_adjusts_with_reliability(
        self, high_backoff, medium_backoff, low_backoff
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 14: Backoff adjusts with reliability
        
        For any backoff configuration, lower reliability domains should
        have higher backoff factors.
        
        Validates: Requirements 3.5
        """
        # Ensure backoff increases with lower reliability
        assume(high_backoff <= medium_backoff <= low_backoff)
        
        # Create manager with custom backoff factors
        manager = AdaptiveRetryManager(
            high_backoff=high_backoff,
            medium_backoff=medium_backoff,
            low_backoff=low_backoff
        )
        
        # Create domains with different reliability levels
        high_domain = "high.com"
        medium_domain = "medium.com"
        low_domain = "low.com"
        
        # High reliability: 95% success
        for _ in range(95):
            manager.record_attempt(high_domain, success=True)
        for _ in range(5):
            manager.record_attempt(high_domain, success=False)
        
        # Medium reliability: 80% success
        for _ in range(80):
            manager.record_attempt(medium_domain, success=True)
        for _ in range(20):
            manager.record_attempt(medium_domain, success=False)
        
        # Low reliability: 50% success
        for _ in range(50):
            manager.record_attempt(low_domain, success=True)
        for _ in range(50):
            manager.record_attempt(low_domain, success=False)
        
        # Get configs
        high_config = manager.get_retry_config(high_domain)
        medium_config = manager.get_retry_config(medium_domain)
        low_config = manager.get_retry_config(low_domain)
        
        # Verify backoff increases with lower reliability
        assert high_config.backoff_factor <= medium_config.backoff_factor
        assert medium_config.backoff_factor <= low_config.backoff_factor
    
    @given(
        domain=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N'))),
        error_msg=st.text(min_size=1, max_size=100)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_15_exhausted_retries_return_descriptive_errors(
        self, domain, error_msg
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 15: Exhausted retries return descriptive errors
        
        For any domain and error message, the formatted error should
        include retry statistics and reliability information.
        
        Validates: Requirements 3.6
        """
        # Create manager
        manager = AdaptiveRetryManager()
        
        # Record some attempts
        for _ in range(7):
            manager.record_attempt(domain, success=True)
        for _ in range(3):
            manager.record_attempt(domain, success=False)
        
        # Format error
        formatted_error = manager.format_exhausted_error(domain, error_msg)
        
        # Verify error contains key information
        assert domain in formatted_error
        assert error_msg in formatted_error
        assert "Reliability:" in formatted_error
        assert "success rate" in formatted_error
        assert "Max retries:" in formatted_error
        assert "Backoff:" in formatted_error
        
        # Verify it includes the reliability tier
        tier = manager.get_reliability_tier(domain)
        assert tier in formatted_error
    
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
        
        Validates: Requirements 3.1, 3.7
        """
        # Create manager
        manager = AdaptiveRetryManager()
        
        # Record different patterns for each domain
        for i, domain in enumerate(domains):
            successes = (i + 1) * 10
            failures = (i + 1) * 2
            
            for _ in range(successes):
                manager.record_attempt(domain, success=True)
            
            for _ in range(failures):
                manager.record_attempt(domain, success=False)
        
        # Verify each domain has independent statistics
        all_stats = manager.get_retry_stats()
        
        for i, domain in enumerate(domains):
            stats = all_stats[domain]
            expected_successes = (i + 1) * 10
            expected_failures = (i + 1) * 2
            
            assert stats['success_count'] == expected_successes
            assert stats['failure_count'] == expected_failures
    
    def test_property_new_domains_assume_high_reliability(self):
        """
        Property: New domains assume high reliability
        
        For any new domain with no history, the manager should
        assume high reliability (1.0 success rate).
        
        Validates: Requirements 3.1, 3.2
        """
        manager = AdaptiveRetryManager()
        
        # Get success rate for new domain
        success_rate = manager.get_success_rate("new-domain.com")
        
        # Should assume high reliability
        assert success_rate == 1.0
        
        # Should use minimal retries
        config = manager.get_retry_config("new-domain.com")
        assert config.max_retries == 2  # Default high reliability max
    
    def test_property_retry_config_converts_to_urllib3(self):
        """
        Property: RetryConfig converts to urllib3 Retry
        
        For any retry configuration, it should convert to a valid
        urllib3 Retry object with matching parameters.
        
        Validates: Requirements 3.2, 3.3, 3.4
        """
        # Create retry config
        config = RetryConfig(
            max_retries=3,
            backoff_factor=1.5
        )
        
        # Convert to urllib3 Retry
        retry = config.to_urllib3_retry()
        
        # Verify conversion
        assert retry.total == 3
        assert retry.backoff_factor == 1.5
        assert 429 in retry.status_forcelist
        assert 500 in retry.status_forcelist
        assert "GET" in retry.allowed_methods
