"""
Property-based tests for Phase 2 configuration
Feature: cf-bypass-phase2-optimizations
"""
import os
import sys
import pytest
from hypothesis import given, strategies as st, settings, HealthCheck

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from phase2_config import Phase2Config


class TestPhase2ConfigProperties:
    """Property-based tests for Phase 2 configuration"""
    
    @given(
        session_pool_enabled=st.booleans(),
        session_pool_size=st.integers(min_value=1, max_value=20),
        pool_connections=st.integers(min_value=1, max_value=100),
        streaming_threshold=st.integers(min_value=1, max_value=100)
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    def test_property_25_environment_variables_loaded(
        self,
        session_pool_enabled,
        session_pool_size,
        pool_connections,
        streaming_threshold,
        monkeypatch
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 25:
        Environment variables are loaded correctly
        
        For any valid environment variable, the configuration should reflect
        the environment value, not the default.
        
        Validates: Requirements 6.1
        """
        # Set environment variables
        monkeypatch.setenv('PHASE2_SESSION_POOL_ENABLED', str(session_pool_enabled).lower())
        monkeypatch.setenv('PHASE2_SESSION_POOL_SIZE', str(session_pool_size))
        monkeypatch.setenv('PHASE2_POOL_CONNECTIONS', str(pool_connections))
        monkeypatch.setenv('PHASE2_STREAMING_THRESHOLD_MB', str(streaming_threshold))
        
        # Load configuration
        config = Phase2Config.from_env()
        
        # Verify environment values are loaded
        assert config.session_pool_enabled == session_pool_enabled
        assert config.session_pool_size == session_pool_size
        assert config.pool_connections == pool_connections
        assert config.streaming_threshold_mb == streaming_threshold
    
    def test_property_26_invalid_config_uses_defaults(self, monkeypatch):
        """
        Feature: cf-bypass-phase2-optimizations, Property 26:
        Invalid configuration uses safe defaults
        
        For any invalid configuration value, the system should use the safe
        default and log a warning.
        
        Validates: Requirements 6.2
        """
        # Test with various invalid values
        test_cases = [
            ('invalid_bool', 'PHASE2_SESSION_POOL_ENABLED', 'not_a_bool'),
            ('invalid_int', 'PHASE2_SESSION_POOL_SIZE', 'not_an_int'),
            ('invalid_float', 'PHASE2_POOL_BACKOFF_FACTOR', 'not_a_float'),
            ('negative', 'PHASE2_SESSION_POOL_SIZE', '-5'),
            ('too_large', 'PHASE2_SESSION_POOL_SIZE', '1000'),
        ]
        
        for test_name, env_var, invalid_value in test_cases:
            # Set invalid environment variable
            monkeypatch.setenv(env_var, invalid_value)
            
            # Load configuration (should not raise exception)
            config = Phase2Config.from_env()
            
            # Verify defaults are used and values are valid
            assert isinstance(config.session_pool_enabled, bool)
            assert isinstance(config.session_pool_size, int)
            assert config.session_pool_size >= 1
            assert config.session_pool_size <= 20
            assert isinstance(config.pool_backoff_factor, float)
            assert config.pool_backoff_factor >= 0.0
            
            # Clean up for next test
            monkeypatch.delenv(env_var, raising=False)
    
    @given(
        global_pool_size=st.integers(min_value=1, max_value=20),
        domain_pool_size=st.integers(min_value=1, max_value=20),
        domain=st.text(min_size=1, max_size=50)
    )
    @settings(max_examples=100)
    def test_property_27_domain_config_overrides_defaults(
        self,
        global_pool_size,
        domain_pool_size,
        domain
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 27:
        Domain-specific config overrides defaults
        
        For any domain with specific configuration, the domain config should
        take precedence over global defaults.
        
        Validates: Requirements 6.4
        """
        # Create configuration with global and domain-specific settings
        config = Phase2Config()
        config.session_pool_size = global_pool_size
        config.domain_overrides[domain] = {
            'session_pool_size': domain_pool_size
        }
        
        # Get domain-specific config
        domain_value = config.get_domain_config(domain, 'session_pool_size', config.session_pool_size)
        
        # Verify domain config overrides global
        assert domain_value == domain_pool_size
        assert domain_value != global_pool_size or global_pool_size == domain_pool_size
    
    @given(
        pool_size=st.integers(min_value=1, max_value=20),
        min_threshold=st.integers(min_value=1, max_value=20),
        pool_connections=st.integers(min_value=1, max_value=100),
        pool_maxsize=st.integers(min_value=1, max_value=200)
    )
    @settings(max_examples=100)
    def test_config_validation_detects_issues(
        self,
        pool_size,
        min_threshold,
        pool_connections,
        pool_maxsize
    ):
        """
        Test that configuration validation detects inconsistencies
        """
        config = Phase2Config()
        config.session_pool_size = pool_size
        config.session_pool_min_threshold = min_threshold
        config.pool_connections = pool_connections
        config.pool_maxsize = pool_maxsize
        
        warnings = config.validate()
        
        # Check for expected warnings
        if min_threshold > pool_size:
            assert any('session_pool_min_threshold' in w for w in warnings)
        
        if pool_connections > pool_maxsize:
            assert any('pool_connections' in w for w in warnings)
    
    @given(
        pool_size=st.integers(min_value=-100, max_value=0),
        pool_connections=st.integers(min_value=-100, max_value=0)
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    def test_negative_values_clamped_to_minimum(
        self,
        pool_size,
        pool_connections,
        monkeypatch
    ):
        """
        Test that negative or zero values are clamped to minimum valid values
        """
        monkeypatch.setenv('PHASE2_SESSION_POOL_SIZE', str(pool_size))
        monkeypatch.setenv('PHASE2_POOL_CONNECTIONS', str(pool_connections))
        
        config = Phase2Config.from_env()
        
        # Verify values are clamped to minimum
        assert config.session_pool_size >= 1
        assert config.pool_connections >= 1
    
    @given(
        pool_size=st.integers(min_value=100, max_value=1000),
        pool_connections=st.integers(min_value=200, max_value=1000)
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    def test_excessive_values_clamped_to_maximum(
        self,
        pool_size,
        pool_connections,
        monkeypatch
    ):
        """
        Test that excessive values are clamped to maximum valid values
        """
        monkeypatch.setenv('PHASE2_SESSION_POOL_SIZE', str(pool_size))
        monkeypatch.setenv('PHASE2_POOL_CONNECTIONS', str(pool_connections))
        
        config = Phase2Config.from_env()
        
        # Verify values are clamped to maximum
        assert config.session_pool_size <= 20
        assert config.pool_connections <= 100
    
    def test_config_to_dict_structure(self):
        """
        Test that to_dict() returns properly structured configuration
        """
        config = Phase2Config()
        config_dict = config.to_dict()
        
        # Verify structure
        assert 'session_pool' in config_dict
        assert 'connection_pool' in config_dict
        assert 'adaptive_retry' in config_dict
        assert 'memory_optimization' in config_dict
        assert 'health_monitoring' in config_dict
        
        # Verify session_pool structure
        assert 'enabled' in config_dict['session_pool']
        assert 'pool_size' in config_dict['session_pool']
        assert 'min_threshold' in config_dict['session_pool']
        
        # Verify health_monitoring structure
        assert 'enabled' in config_dict['health_monitoring']
        assert 'auto_recovery_enabled' in config_dict['health_monitoring']
        assert 'degraded_error_rate' in config_dict['health_monitoring']
        assert 'slow_response_multiplier' in config_dict['health_monitoring']
        
        # Verify all values are JSON-serializable types
        import json
        json.dumps(config_dict)  # Should not raise exception
