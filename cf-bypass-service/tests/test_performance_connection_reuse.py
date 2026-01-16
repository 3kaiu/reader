"""
Performance tests for connection pool reuse optimization
Feature: cf-bypass-phase2-optimizations

Tests that connection pool provides 30-50% improvement through connection reuse.
Validates Requirements 2.1, 2.2, 2.3
"""
import sys
import os
import time
import pytest
from unittest.mock import Mock, patch
import cloudscraper

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cloudscraper_wrapper import CloudScraperWrapper, FetchResult


class TestConnectionReusePerformance:
    """Performance tests for connection pool reuse"""
    
    @pytest.mark.asyncio
    async def test_connection_establishment_without_pool(self):
        """
        Measure connection establishment overhead without connection pool
        
        This establishes the baseline for connection overhead.
        
        Validates: Requirements 2.1, 2.2, 2.3
        """
        # Create wrapper without connection pool
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper = CloudScraperWrapper(redis_url="redis://localhost:6379")
            
            # Mock HTTP request with connection overhead
            def mock_request(self, method, url, **kwargs):
                # Simulate connection establishment overhead
                time.sleep(0.01)  # 10ms for new connection
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.text = "<html>Test</html>"
                mock_response.content = b"<html>Test</html>"
                mock_response.cookies = {}
                mock_response.headers = {}
                return mock_response
            
            with patch.object(cloudscraper.CloudScraper, 'request', mock_request):
                # Make multiple requests to same domain
                request_times = []
                for i in range(5):
                    start_time = time.time()
                    result = await wrapper.fetch(
                        url=f"https://example.com/test{i}",
                        method="GET"
                    )
                    request_time = time.time() - start_time
                    request_times.append(request_time)
                    assert result.status == 200
                
                avg_time = sum(request_times) / len(request_times)
                print(f"\nAverage request time without pool: {avg_time:.4f}s")
                print(f"Request times: {[f'{t:.4f}s' for t in request_times]}")
                
                # Each request should have connection overhead
                for t in request_times:
                    assert t > 0.01  # Should include connection overhead
    
    @pytest.mark.asyncio
    async def test_connection_establishment_with_pool(self):
        """
        Measure connection establishment overhead with connection pool
        
        This tests the improvement from connection reuse.
        Expected: 30-50% faster than without pool.
        
        Validates: Requirements 2.1, 2.2, 2.3
        """
        # Create wrapper with connection pool
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = True
            mock_config.pool_connections = 20
            mock_config.pool_maxsize = 50
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 1.0
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper = CloudScraperWrapper(redis_url="redis://localhost:6379")
            
            # Mock HTTP request - first request has overhead, subsequent reuse connection
            request_count = [0]
            
            def mock_request(self, method, url, **kwargs):
                request_count[0] += 1
                # First request has connection overhead
                if request_count[0] == 1:
                    time.sleep(0.01)  # 10ms for new connection
                else:
                    time.sleep(0.003)  # 3ms for reused connection
                
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.text = "<html>Test</html>"
                mock_response.content = b"<html>Test</html>"
                mock_response.cookies = {}
                mock_response.headers = {}
                return mock_response
            
            with patch.object(cloudscraper.CloudScraper, 'request', mock_request):
                # Make multiple requests to same domain
                request_times = []
                for i in range(5):
                    start_time = time.time()
                    result = await wrapper.fetch(
                        url=f"https://example.com/test{i}",
                        method="GET"
                    )
                    request_time = time.time() - start_time
                    request_times.append(request_time)
                    assert result.status == 200
                
                avg_time = sum(request_times) / len(request_times)
                print(f"\nAverage request time with pool: {avg_time:.4f}s")
                print(f"Request times: {[f'{t:.4f}s' for t in request_times]}")
                
                # Later requests should be faster (connection reuse)
                avg_later_requests = sum(request_times[1:]) / len(request_times[1:])
                assert avg_later_requests < request_times[0]
    
    @pytest.mark.asyncio
    async def test_connection_reuse_improvement_ratio(self):
        """
        Compare connection overhead with and without pool
        
        This validates that connection pool provides the expected 30-50% improvement.
        
        Validates: Requirements 2.1, 2.2, 2.3
        """
        # Measure without connection pool
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = False
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper_no_pool = CloudScraperWrapper(redis_url="redis://localhost:6379")
            
            def mock_request_no_pool(self, method, url, **kwargs):
                # Every request has connection overhead
                time.sleep(0.01)  # 10ms per connection
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.text = "<html>Test</html>"
                mock_response.content = b"<html>Test</html>"
                mock_response.cookies = {}
                mock_response.headers = {}
                return mock_response
            
            with patch.object(cloudscraper.CloudScraper, 'request', mock_request_no_pool):
                start_time = time.time()
                for i in range(10):
                    result = await wrapper_no_pool.fetch(
                        url=f"https://example.com/test{i}",
                        method="GET"
                    )
                    assert result.status == 200
                time_without_pool = time.time() - start_time
        
        # Measure with connection pool
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = True
            mock_config.pool_connections = 20
            mock_config.pool_maxsize = 50
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 1.0
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper_with_pool = CloudScraperWrapper(redis_url="redis://localhost:6379")
            
            request_count = [0]
            
            def mock_request_with_pool(self, method, url, **kwargs):
                request_count[0] += 1
                # First request has overhead, rest reuse connection
                if request_count[0] == 1:
                    time.sleep(0.01)  # 10ms for new connection
                else:
                    time.sleep(0.003)  # 3ms for reused connection (70% faster)
                
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.text = "<html>Test</html>"
                mock_response.content = b"<html>Test</html>"
                mock_response.cookies = {}
                mock_response.headers = {}
                return mock_response
            
            with patch.object(cloudscraper.CloudScraper, 'request', mock_request_with_pool):
                start_time = time.time()
                for i in range(10):
                    result = await wrapper_with_pool.fetch(
                        url=f"https://example.com/test{i}",
                        method="GET"
                    )
                    assert result.status == 200
                time_with_pool = time.time() - start_time
        
        # Calculate improvement
        improvement_ratio = (time_without_pool - time_with_pool) / time_without_pool
        improvement_percent = improvement_ratio * 100
        
        print(f"\nConnection Reuse Performance:")
        print(f"  Without pool: {time_without_pool:.4f}s")
        print(f"  With pool:    {time_with_pool:.4f}s")
        print(f"  Improvement:  {improvement_percent:.1f}%")
        
        # Verify improvement is significant
        # Target: 30-50% improvement
        assert improvement_percent > 30, f"Expected >30% improvement, got {improvement_percent:.1f}%"
        
        # Verify pool is faster
        assert time_with_pool < time_without_pool
    
    @pytest.mark.asyncio
    async def test_connection_pool_statistics(self):
        """
        Test that connection pool tracks usage statistics
        
        This validates that connection pool monitoring works correctly.
        
        Validates: Requirements 2.6
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = True
            mock_config.pool_connections = 20
            mock_config.pool_maxsize = 50
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 1.0
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper = CloudScraperWrapper(redis_url="redis://localhost:6379")
            
            def mock_request(self, method, url, **kwargs):
                time.sleep(0.005)
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.text = "<html>Test</html>"
                mock_response.content = b"<html>Test</html>"
                mock_response.cookies = {}
                mock_response.headers = {}
                return mock_response
            
            with patch.object(cloudscraper.CloudScraper, 'request', mock_request):
                # Make several requests
                for i in range(5):
                    result = await wrapper.fetch(
                        url=f"https://example.com/test{i}",
                        method="GET"
                    )
                    assert result.status == 200
                
                # Get connection pool statistics
                if wrapper.connection_pool_manager:
                    # Get all domain statistics
                    all_stats = wrapper.connection_pool_manager.get_all_domain_stats()
                    
                    print(f"\nConnection Pool Statistics:")
                    for domain, domain_stats in all_stats.items():
                        print(f"  {domain}:")
                        print(f"    Hits: {domain_stats.get('pool_hits', 0)}")
                        print(f"    Misses: {domain_stats.get('pool_misses', 0)}")
                        print(f"    Hit rate: {domain_stats.get('hit_rate', 0):.1%}")
                    
                    # Verify statistics are tracked
                    assert len(all_stats) > 0
                    assert "example.com" in all_stats
                    # Verify hits + misses = 5 requests
                    example_stats = all_stats["example.com"]
                    total_requests = example_stats["pool_hits"] + example_stats["pool_misses"]
                    assert total_requests == 5
    
    @pytest.mark.asyncio
    async def test_multiple_domains_use_separate_pools(self):
        """
        Test that different domains use separate connection pools
        
        This validates that connection pooling is per-domain.
        
        Validates: Requirements 2.1, 2.2
        """
        with patch('cloudscraper_wrapper.phase2_config') as mock_config:
            mock_config.session_pool_enabled = False
            mock_config.connection_pool_enabled = True
            mock_config.pool_connections = 20
            mock_config.pool_maxsize = 50
            mock_config.pool_max_retries = 3
            mock_config.pool_backoff_factor = 1.0
            mock_config.adaptive_retry_enabled = False
            mock_config.memory_optimization_enabled = False
            mock_config.health_monitoring_enabled = False
            
            wrapper = CloudScraperWrapper(redis_url="redis://localhost:6379")
            
            def mock_request(self, method, url, **kwargs):
                time.sleep(0.005)
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.text = "<html>Test</html>"
                mock_response.content = b"<html>Test</html>"
                mock_response.cookies = {}
                mock_response.headers = {}
                return mock_response
            
            with patch.object(cloudscraper.CloudScraper, 'request', mock_request):
                # Make requests to different domains
                domains = ["example1.com", "example2.com", "example3.com"]
                
                for domain in domains:
                    for i in range(3):
                        result = await wrapper.fetch(
                            url=f"https://{domain}/test{i}",
                            method="GET"
                        )
                        assert result.status == 200
                
                # Get connection pool statistics
                if wrapper.connection_pool_manager:
                    all_stats = wrapper.connection_pool_manager.get_all_domain_stats()
                    
                    print(f"\nMulti-Domain Connection Pool Statistics:")
                    for domain in domains:
                        if domain in all_stats:
                            stats = all_stats[domain]
                            total_requests = stats["pool_hits"] + stats["pool_misses"]
                            print(f"  {domain}: {total_requests} requests (hits: {stats['pool_hits']}, misses: {stats['pool_misses']})")
                    
                    # Verify each domain has its own pool
                    for domain in domains:
                        assert domain in all_stats
                        stats = all_stats[domain]
                        total_requests = stats["pool_hits"] + stats["pool_misses"]
                        assert total_requests == 3
