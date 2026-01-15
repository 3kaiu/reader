"""
Integration tests for Manual Recovery Endpoint
Feature: cf-bypass-phase2-optimizations
"""
import sys
import os
import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from cloudscraper_wrapper import CloudScraperWrapper
from health_monitor import EnhancedHealthMonitor


class TestRecoveryIntegration:
    """Integration tests for manual recovery endpoint"""
    
    def test_manual_recovery_endpoint_success(self):
        """
        Integration test: manual recovery via API
        
        Validates that:
        1. POST /recover endpoint can be called
        2. Recovery resets domain sessions
        3. Recovery clears session pool
        4. Recovery resets health statistics
        5. Response includes health status before/after
        
        Validates: Requirements 5.7
        """
        client = TestClient(app)
        domain = "degraded-domain.com"
        
        # Mock the engine to have enhanced health monitor
        with patch('app.engine') as mock_engine:
            # Setup mock health monitor
            mock_health_monitor = Mock(spec=EnhancedHealthMonitor)
            mock_health_monitor.get_health_stats.return_value = {
                'domain': domain,
                'status': 'degraded',
                'error_rate': 0.6,
                'avg_response_time': 2.5,
                'total_requests': 100,
                'success_count': 40,
                'error_count': 60
            }
            mock_health_monitor.reset_domain_stats = Mock()
            
            # Setup mock scrapers
            mock_scrapers = {domain: Mock()}
            
            # Setup mock session pool manager
            mock_session_pool = Mock()
            mock_session_pool._pools = {domain: Mock()}
            mock_session_pool._pools[domain].clear = Mock()
            
            # Configure mock engine
            mock_engine.health_monitor = mock_health_monitor
            mock_engine.scrapers = mock_scrapers
            mock_engine.session_pool_manager = mock_session_pool
            
            # Mock phase2_config
            with patch('app.phase2_config') as mock_config:
                mock_config.health_monitoring_enabled = True
                
                # Call recovery endpoint
                response = client.post(f"/recover?domain={domain}")
                
                # Verify response
                assert response.status_code == 200
                data = response.json()
                
                assert data['success'] is True
                assert data['domain'] == domain
                assert 'message' in data
                assert 'health_before' in data
                assert 'health_after' in data
                assert 'actions_taken' in data
                
                # Verify recovery actions were called
                assert domain not in mock_scrapers  # Session removed
                mock_session_pool._pools[domain].clear.assert_called_once()
                mock_health_monitor.reset_domain_stats.assert_called_once_with(domain)
    
    def test_manual_recovery_endpoint_health_monitoring_disabled(self):
        """
        Integration test: recovery fails when health monitoring disabled
        
        Validates that:
        1. Recovery endpoint returns error when health monitoring disabled
        2. No recovery actions are performed
        
        Validates: Requirements 5.7
        """
        client = TestClient(app)
        domain = "test-domain.com"
        
        # Mock phase2_config with health monitoring disabled
        with patch('app.phase2_config') as mock_config:
            mock_config.health_monitoring_enabled = False
            
            # Call recovery endpoint
            response = client.post(f"/recover?domain={domain}")
            
            # Verify error response
            assert response.status_code == 400
            data = response.json()
            assert 'Health monitoring is not enabled' in data['detail']
    
    def test_manual_recovery_endpoint_no_enhanced_monitor(self):
        """
        Integration test: recovery fails when enhanced monitor not available
        
        Validates that:
        1. Recovery endpoint returns error when basic monitor is used
        2. No recovery actions are performed
        
        Validates: Requirements 5.7
        """
        client = TestClient(app)
        domain = "test-domain.com"
        
        # Mock the engine with basic health monitor (no reset_domain_stats method)
        with patch('app.engine') as mock_engine:
            mock_health_monitor = Mock()
            # Don't add reset_domain_stats method - use hasattr to check
            delattr(mock_health_monitor, 'reset_domain_stats') if hasattr(mock_health_monitor, 'reset_domain_stats') else None
            mock_engine.health_monitor = mock_health_monitor
            
            # Mock phase2_config
            with patch('app.phase2_config') as mock_config:
                mock_config.health_monitoring_enabled = True
                
                # Call recovery endpoint
                response = client.post(f"/recover?domain={domain}")
                
                # Verify error response
                assert response.status_code == 400
                data = response.json()
                assert 'Enhanced health monitor is not available' in data['detail']
    
    def test_manual_recovery_endpoint_with_api_key(self):
        """
        Integration test: recovery endpoint respects API key authentication
        
        Validates that:
        1. Recovery endpoint requires valid API key when configured
        2. Invalid API key returns 401
        3. Valid API key allows recovery
        
        Validates: Requirements 5.7
        """
        client = TestClient(app)
        domain = "test-domain.com"
        
        # Mock config with API key
        with patch('app.config') as mock_config:
            mock_config.api_key = "test-key-123"
            
            # Test without API key
            response = client.post(f"/recover?domain={domain}")
            assert response.status_code == 401
            
            # Test with invalid API key
            response = client.post(
                f"/recover?domain={domain}",
                headers={"X-API-Key": "wrong-key"}
            )
            assert response.status_code == 401
            
            # Test with valid API key
            with patch('app.engine') as mock_engine:
                mock_health_monitor = Mock(spec=EnhancedHealthMonitor)
                mock_health_monitor.get_health_stats.return_value = {
                    'domain': domain,
                    'status': 'healthy',
                    'error_rate': 0.1,
                    'total_requests': 10
                }
                mock_health_monitor.reset_domain_stats = Mock()
                
                mock_engine.health_monitor = mock_health_monitor
                mock_engine.scrapers = {}
                mock_engine.session_pool_manager = None
                
                with patch('app.phase2_config') as mock_phase2_config:
                    mock_phase2_config.health_monitoring_enabled = True
                    
                    response = client.post(
                        f"/recover?domain={domain}",
                        headers={"X-API-Key": "test-key-123"}
                    )
                    assert response.status_code == 200
    
    def test_manual_recovery_endpoint_error_handling(self):
        """
        Integration test: recovery endpoint handles errors gracefully
        
        Validates that:
        1. Recovery endpoint catches and reports errors
        2. Error response includes error message
        
        Validates: Requirements 5.7
        """
        client = TestClient(app)
        domain = "test-domain.com"
        
        # Mock the engine to raise an error during recovery
        with patch('app.engine') as mock_engine:
            mock_health_monitor = Mock(spec=EnhancedHealthMonitor)
            mock_health_monitor.get_health_stats.side_effect = Exception("Test error")
            
            mock_engine.health_monitor = mock_health_monitor
            mock_engine.scrapers = {}
            
            # Mock phase2_config
            with patch('app.phase2_config') as mock_config:
                mock_config.health_monitoring_enabled = True
                
                # Call recovery endpoint
                response = client.post(f"/recover?domain={domain}")
                
                # Verify error response
                assert response.status_code == 500
                data = response.json()
                assert 'Recovery failed' in data['detail']
                assert 'Test error' in data['detail']
    
    def test_recovery_clears_both_sessions_and_pool(self):
        """
        Integration test: recovery clears both regular sessions and pool
        
        Validates that:
        1. Recovery removes domain from scrapers dict
        2. Recovery clears session pool for domain
        3. Both actions are reported in response
        
        Validates: Requirements 5.3, 5.7
        """
        client = TestClient(app)
        domain = "test-domain.com"
        
        with patch('app.engine') as mock_engine:
            # Setup mock health monitor
            mock_health_monitor = Mock(spec=EnhancedHealthMonitor)
            mock_health_monitor.get_health_stats.return_value = {
                'domain': domain,
                'status': 'degraded',
                'error_rate': 0.7
            }
            mock_health_monitor.reset_domain_stats = Mock()
            
            # Setup mock scrapers with domain
            mock_session = Mock()
            mock_scrapers = {domain: mock_session}
            
            # Setup mock session pool with domain
            mock_pool = Mock()
            mock_pool.clear = Mock()
            mock_session_pool = Mock()
            mock_session_pool._pools = {domain: mock_pool}
            
            # Configure mock engine
            mock_engine.health_monitor = mock_health_monitor
            mock_engine.scrapers = mock_scrapers
            mock_engine.session_pool_manager = mock_session_pool
            
            # Mock phase2_config
            with patch('app.phase2_config') as mock_config:
                mock_config.health_monitoring_enabled = True
                
                # Call recovery endpoint
                response = client.post(f"/recover?domain={domain}")
                
                # Verify response
                assert response.status_code == 200
                data = response.json()
                
                # Verify both actions were taken
                actions = data['actions_taken']
                assert "Reset domain sessions" in actions
                assert "Cleared session pool" in actions
                assert "Reset health statistics" in actions
                
                # Verify session was removed
                assert domain not in mock_scrapers
                
                # Verify pool was cleared
                mock_pool.clear.assert_called_once()
                
                # Verify health stats were reset
                mock_health_monitor.reset_domain_stats.assert_called_once_with(domain)
    
    def test_recovery_without_session_pool(self):
        """
        Integration test: recovery works when session pool is disabled
        
        Validates that:
        1. Recovery works even when session pool is not enabled
        2. Only applicable actions are performed
        3. Response correctly reports actions taken
        
        Validates: Requirements 5.7
        """
        client = TestClient(app)
        domain = "test-domain.com"
        
        with patch('app.engine') as mock_engine:
            # Setup mock health monitor
            mock_health_monitor = Mock(spec=EnhancedHealthMonitor)
            mock_health_monitor.get_health_stats.return_value = {
                'domain': domain,
                'status': 'degraded'
            }
            mock_health_monitor.reset_domain_stats = Mock()
            
            # Setup mock scrapers
            mock_scrapers = {domain: Mock()}
            
            # No session pool manager
            mock_engine.health_monitor = mock_health_monitor
            mock_engine.scrapers = mock_scrapers
            mock_engine.session_pool_manager = None
            
            # Mock phase2_config
            with patch('app.phase2_config') as mock_config:
                mock_config.health_monitoring_enabled = True
                
                # Call recovery endpoint
                response = client.post(f"/recover?domain={domain}")
                
                # Verify response
                assert response.status_code == 200
                data = response.json()
                
                # Verify actions taken
                actions = data['actions_taken']
                assert "Reset domain sessions" in actions
                assert "Reset health statistics" in actions
                
                # Session pool action should not be in list (filtered out)
                assert "Cleared session pool" not in actions
                assert None not in actions  # No None values
