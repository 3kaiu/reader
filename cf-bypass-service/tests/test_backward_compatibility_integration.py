"""
Integration tests for backward compatibility with existing API endpoints
Feature: cf-bypass-phase2-optimizations

Tests that all existing API endpoints work correctly with Phase 2 enabled/disabled:
- /health endpoint
- /fetch endpoint
- /tokens endpoint
- /stats endpoint
- /fetch/parallel endpoint
- /fetch/batch endpoint
- /config endpoint (Phase 2 only)
- /warmup endpoint (Phase 2 only)
- /recover endpoint (Phase 2 only)
"""
import sys
import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import cloudscraper

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app


class TestBackwardCompatibilityIntegration:
    """Integration tests for backward compatibility with existing API endpoints"""
    
    def test_health_endpoint_with_phase2_enabled(self):
        """
        Test /health endpoint with Phase 2 enabled
        
        Validates that health endpoint returns correct structure
        with Phase 2 optimizations enabled.
        
        Validates: Requirements 8.1, 8.2
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = True
            mock_config.adaptive_retry_enabled = True
            mock_config.memory_optimization_enabled = True
            mock_config.health_monitoring_enabled = True
            
            client = TestClient(app)
            response = client.get("/health")
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify response structure
            assert "status" in data
            assert "version" in data
            assert "timestamp" in data
            assert "active_sessions" in data
            assert "engine" in data
            assert "cache_available" in data
            
            # Verify values
            assert data["status"] == "healthy"
            assert data["version"] == "5.0.0"
            assert data["engine"] == "CloudScraper"
    
    def test_health_endpoint_with_phase2_disabled(self):
        """
        Test /health endpoint with Phase 2 disabled
        
        Validates that health endpoint returns same structure
        with Phase 2 optimizations disabled.
        
        Validates: Requirements 8.1, 8.2, 8.3
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            client = TestClient(app)
            response = client.get("/health")
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify response structure is identical
            assert "status" in data
            assert "version" in data
            assert "timestamp" in data
            assert "active_sessions" in data
            assert "engine" in data
            assert "cache_available" in data
            
            # Verify values
            assert data["status"] == "healthy"
            assert data["version"] == "5.0.0"
            assert data["engine"] == "CloudScraper"
    
    def test_fetch_endpoint_with_phase2_enabled(self):
        """
        Test /fetch endpoint with Phase 2 enabled
        
        Validates that fetch endpoint returns correct structure
        with Phase 2 optimizations enabled.
        
        Validates: Requirements 8.1, 8.2
        """
        # Create mock fetch result
        from cloudscraper_wrapper import FetchResult
        
        async def mock_fetch(self, **kwargs):
            return FetchResult(
                status=200,
                html="<html>Test</html>",
                cookies={"test": "cookie"},
                headers={"Content-Type": "text/html"},
                cf_bypassed=True,
                error=None
            )
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = True
            mock_config.adaptive_retry_enabled = True
            mock_config.memory_optimization_enabled = True
            mock_config.health_monitoring_enabled = True
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.fetch', mock_fetch):
                client = TestClient(app)
                response = client.post(
                    "/fetch",
                    json={
                        "url": "https://example.com/test",
                        "method": "GET"
                    }
                )
                
                assert response.status_code == 200
                data = response.json()
                
                # Verify response structure
                assert "status" in data
                assert "html" in data
                assert "cookies" in data
                assert "headers" in data
                assert "cf_bypassed" in data
                
                # Verify values
                assert data["status"] == 200
                assert data["html"] == "<html>Test</html>"
                assert isinstance(data["cookies"], dict)
                assert isinstance(data["headers"], dict)
                assert isinstance(data["cf_bypassed"], bool)
    
    def test_fetch_endpoint_with_phase2_disabled(self):
        """
        Test /fetch endpoint with Phase 2 disabled
        
        Validates that fetch endpoint returns same structure
        with Phase 2 optimizations disabled.
        
        Validates: Requirements 8.1, 8.2, 8.3
        """
        # Create mock fetch result
        from cloudscraper_wrapper import FetchResult
        
        async def mock_fetch(self, **kwargs):
            return FetchResult(
                status=200,
                html="<html>Test</html>",
                cookies={"test": "cookie"},
                headers={"Content-Type": "text/html"},
                cf_bypassed=True,
                error=None
            )
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.fetch', mock_fetch):
                client = TestClient(app)
                response = client.post(
                    "/fetch",
                    json={
                        "url": "https://example.com/test",
                        "method": "GET"
                    }
                )
                
                assert response.status_code == 200
                data = response.json()
                
                # Verify response structure is identical
                assert "status" in data
                assert "html" in data
                assert "cookies" in data
                assert "headers" in data
                assert "cf_bypassed" in data
                
                # Verify values
                assert data["status"] == 200
                assert data["html"] == "<html>Test</html>"
                assert isinstance(data["cookies"], dict)
                assert isinstance(data["headers"], dict)
                assert isinstance(data["cf_bypassed"], bool)
    
    def test_tokens_endpoint_with_phase2_enabled(self):
        """
        Test /tokens endpoint with Phase 2 enabled
        
        Validates: Requirements 8.1, 8.2
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = True
            
            client = TestClient(app)
            response = client.get("/tokens?domain=example.com")
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify response structure
            assert "source" in data
            assert "cookies" in data
            assert "user_agent" in data
    
    def test_tokens_endpoint_with_phase2_disabled(self):
        """
        Test /tokens endpoint with Phase 2 disabled
        
        Validates: Requirements 8.1, 8.2, 8.3
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            
            client = TestClient(app)
            response = client.get("/tokens?domain=example.com")
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify response structure is identical
            assert "source" in data
            assert "cookies" in data
            assert "user_agent" in data
    
    def test_stats_endpoint_with_phase2_enabled(self):
        """
        Test /stats endpoint with Phase 2 enabled
        
        Validates: Requirements 8.1, 8.2
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = True
            mock_config.adaptive_retry_enabled = True
            mock_config.memory_optimization_enabled = True
            mock_config.health_monitoring_enabled = True
            
            client = TestClient(app)
            response = client.get("/stats")
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify basic structure
            assert "active_sessions" in data
            assert "domains" in data
            assert "engine" in data
            
            # Verify Phase 2 stats are present
            assert "session_pool" in data or "performance" in data
    
    def test_stats_endpoint_with_phase2_disabled(self):
        """
        Test /stats endpoint with Phase 2 disabled
        
        Validates: Requirements 8.1, 8.2, 8.3
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            client = TestClient(app)
            response = client.get("/stats")
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify basic structure is present
            assert "active_sessions" in data
            assert "domains" in data
            assert "engine" in data
    
    def test_fetch_parallel_endpoint_with_phase2_enabled(self):
        """
        Test /fetch/parallel endpoint with Phase 2 enabled
        
        Validates: Requirements 8.1, 8.2
        """
        # Create mock fetch results
        from cloudscraper_wrapper import FetchResult
        
        async def mock_fetch_parallel(self, requests):
            return [
                FetchResult(
                    status=200,
                    html="<html>Test</html>",
                    cookies={},
                    headers={},
                    cf_bypassed=True,
                    error=None
                )
                for _ in requests
            ]
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = True
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.fetch_parallel', mock_fetch_parallel):
                client = TestClient(app)
                response = client.post(
                    "/fetch/parallel",
                    json=[
                        {"url": "https://example1.com/test", "method": "GET"},
                        {"url": "https://example2.com/test", "method": "GET"}
                    ]
                )
                
                assert response.status_code == 200
                data = response.json()
                
                # Verify response is a list
                assert isinstance(data, list)
                assert len(data) == 2
                
                # Verify each response has correct structure
                for item in data:
                    assert "status" in item
                    assert "html" in item
                    assert "cookies" in item
                    assert "headers" in item
                    assert "cf_bypassed" in item
    
    def test_fetch_parallel_endpoint_with_phase2_disabled(self):
        """
        Test /fetch/parallel endpoint with Phase 2 disabled
        
        Validates: Requirements 8.1, 8.2, 8.3
        """
        # Create mock fetch results
        from cloudscraper_wrapper import FetchResult
        
        async def mock_fetch_parallel(self, requests):
            return [
                FetchResult(
                    status=200,
                    html="<html>Test</html>",
                    cookies={},
                    headers={},
                    cf_bypassed=True,
                    error=None
                )
                for _ in requests
            ]
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.fetch_parallel', mock_fetch_parallel):
                client = TestClient(app)
                response = client.post(
                    "/fetch/parallel",
                    json=[
                        {"url": "https://example1.com/test", "method": "GET"},
                        {"url": "https://example2.com/test", "method": "GET"}
                    ]
                )
                
                assert response.status_code == 200
                data = response.json()
                
                # Verify response structure is identical
                assert isinstance(data, list)
                assert len(data) == 2
                
                # Verify each response has correct structure
                for item in data:
                    assert "status" in item
                    assert "html" in item
                    assert "cookies" in item
                    assert "headers" in item
                    assert "cf_bypassed" in item
    
    def test_fetch_batch_endpoint_with_phase2_enabled(self):
        """
        Test /fetch/batch endpoint with Phase 2 enabled
        
        Validates: Requirements 8.1, 8.2
        """
        # Create mock fetch results
        from cloudscraper_wrapper import FetchResult
        
        async def mock_fetch_batch(self, urls, **kwargs):
            return [
                FetchResult(
                    status=200,
                    html="<html>Test</html>",
                    cookies={},
                    headers={},
                    cf_bypassed=True,
                    error=None
                )
                for _ in urls
            ]
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.connection_pool_enabled = True
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.fetch_batch', mock_fetch_batch):
                client = TestClient(app)
                response = client.post(
                    "/fetch/batch",
                    json={
                        "urls": [
                            "https://example.com/test1",
                            "https://example.com/test2"
                        ],
                        "method": "GET"
                    }
                )
                
                assert response.status_code == 200
                data = response.json()
                
                # Verify response is a list
                assert isinstance(data, list)
                assert len(data) == 2
                
                # Verify each response has correct structure
                for item in data:
                    assert "status" in item
                    assert "html" in item
                    assert "cookies" in item
                    assert "headers" in item
                    assert "cf_bypassed" in item
    
    def test_fetch_batch_endpoint_with_phase2_disabled(self):
        """
        Test /fetch/batch endpoint with Phase 2 disabled
        
        Validates: Requirements 8.1, 8.2, 8.3
        """
        # Create mock fetch results
        from cloudscraper_wrapper import FetchResult
        
        async def mock_fetch_batch(self, urls, **kwargs):
            return [
                FetchResult(
                    status=200,
                    html="<html>Test</html>",
                    cookies={},
                    headers={},
                    cf_bypassed=True,
                    error=None
                )
                for _ in urls
            ]
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.fetch_batch', mock_fetch_batch):
                client = TestClient(app)
                response = client.post(
                    "/fetch/batch",
                    json={
                        "urls": [
                            "https://example.com/test1",
                            "https://example.com/test2"
                        ],
                        "method": "GET"
                    }
                )
                
                assert response.status_code == 200
                data = response.json()
                
                # Verify response structure is identical
                assert isinstance(data, list)
                assert len(data) == 2
                
                # Verify each response has correct structure
                for item in data:
                    assert "status" in item
                    assert "html" in item
                    assert "cookies" in item
                    assert "headers" in item
                    assert "cf_bypassed" in item
    
    def test_config_endpoint_with_phase2_enabled(self):
        """
        Test /config endpoint with Phase 2 enabled
        
        This is a Phase 2 specific endpoint.
        
        Validates: Requirements 8.1, 8.2
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            mock_config.to_dict = Mock(return_value={"session_pool_enabled": True})
            
            client = TestClient(app)
            response = client.get("/config")
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify response structure
            assert "phase2" in data
            assert "version" in data
            assert data["version"] == "5.0.0"
    
    def test_warmup_endpoint_with_phase2_enabled(self):
        """
        Test /warmup endpoint with Phase 2 enabled
        
        This is a Phase 2 specific endpoint.
        
        Validates: Requirements 8.1, 8.2
        """
        async def mock_warmup_domain(self, domain):
            return {
                "success": True,
                "domain": domain,
                "pool_size": 3,
                "warmup_time": 0.5,
                "stats": {}
            }
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = True
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.warmup_domain', mock_warmup_domain):
                client = TestClient(app)
                response = client.post("/warmup?domain=example.com")
                
                assert response.status_code == 200
                data = response.json()
                
                # Verify response structure
                assert "success" in data
                assert data["success"] == True
    
    def test_warmup_endpoint_with_phase2_disabled(self):
        """
        Test /warmup endpoint with Phase 2 disabled
        
        Should return error when session pool is disabled.
        
        Validates: Requirements 8.3
        """
        async def mock_warmup_domain(self, domain):
            return {
                "success": False,
                "error": "Session pool is not enabled"
            }
        
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            
            with patch('cloudscraper_wrapper.CloudScraperWrapper.warmup_domain', mock_warmup_domain):
                client = TestClient(app)
                response = client.post("/warmup?domain=example.com")
                
                # Should return error
                assert response.status_code == 500
                data = response.json()
                assert "detail" in data
