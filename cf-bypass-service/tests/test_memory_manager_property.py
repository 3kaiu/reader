"""
Property-Based Tests for Memory Manager
Tests universal properties that should hold for all memory management configurations.
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import Mock
from datetime import datetime, timedelta
from memory_manager import MemoryManager, MemoryStats


class TestMemoryManagerProperties:
    """Property-based tests for MemoryManager"""
    
    @given(
        content_length_mb=st.floats(min_value=0.1, max_value=100.0),
        threshold_mb=st.integers(min_value=1, max_value=50)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_16_large_responses_trigger_streaming(
        self, content_length_mb, threshold_mb
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 16: Large responses trigger streaming
        
        For any response size and streaming threshold, responses larger than
        the threshold should trigger streaming mode.
        
        Validates: Requirements 4.1
        """
        # Create manager with custom threshold
        manager = MemoryManager(streaming_threshold_mb=threshold_mb)
        
        # Convert MB to bytes
        content_length_bytes = int(content_length_mb * 1024 * 1024)
        
        # Check if streaming should be used
        should_stream = manager.should_stream_response(content_length_bytes)
        
        # Verify streaming decision
        if content_length_mb > threshold_mb:
            assert should_stream is True
        else:
            assert should_stream is False
    
    @given(
        idle_hours=st.floats(min_value=0.1, max_value=5.0),
        timeout_hours=st.integers(min_value=1, max_value=3)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_17_idle_sessions_are_cleaned_up(
        self, idle_hours, timeout_hours
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 17: Idle sessions are cleaned up
        
        For any idle duration and timeout threshold, sessions idle longer than
        the timeout should be identified for cleanup.
        
        Validates: Requirements 4.2
        """
        # Avoid edge cases where idle_hours is very close to timeout_hours
        assume(abs(idle_hours - timeout_hours) > 0.1)
        
        # Create manager with custom timeout
        manager = MemoryManager(idle_session_timeout_hours=timeout_hours)
        
        # Record session use at a past time
        session_id = "test-session"
        past_time = datetime.now() - timedelta(hours=idle_hours)
        manager._session_last_used[session_id] = past_time
        
        # Get idle sessions
        idle_sessions = manager.get_idle_sessions()
        
        # Verify idle detection (strictly greater than timeout)
        if idle_hours > timeout_hours:
            assert session_id in idle_sessions
        else:
            assert session_id not in idle_sessions
    
    @given(
        cache_size=st.integers(min_value=1, max_value=100),
        cache_limit=st.integers(min_value=10, max_value=50)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_18_cache_implements_lru_eviction(
        self, cache_size, cache_limit
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 18: Cache implements LRU eviction
        
        For any cache size and limit, when the cache exceeds the limit,
        the oldest entries should be evicted (LRU).
        
        Validates: Requirements 4.3
        """
        # Create manager with custom cache limit
        manager = MemoryManager(cache_size_limit=cache_limit)
        
        # Add entries to cache
        for i in range(cache_size):
            manager.add_to_cache(f"key-{i}", f"value-{i}")
        
        # Verify cache size doesn't exceed limit
        assert len(manager._lru_cache) <= cache_limit
        
        # If we added more than the limit, verify oldest were evicted
        if cache_size > cache_limit:
            # Cache should be at limit
            assert len(manager._lru_cache) == cache_limit
            
            # Oldest entries should be evicted
            # The first (cache_size - cache_limit) entries should be gone
            for i in range(cache_size - cache_limit):
                assert f"key-{i}" not in manager._lru_cache
            
            # Newest entries should remain
            for i in range(cache_size - cache_limit, cache_size):
                assert f"key-{i}" in manager._lru_cache
    
    @given(
        memory_percent=st.floats(min_value=0.0, max_value=100.0),
        threshold=st.floats(min_value=0.5, max_value=0.95)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_19_high_memory_triggers_aggressive_cleanup(
        self, memory_percent, threshold
    ):
        """
        Feature: cf-bypass-phase2-optimizations, Property 19: High memory triggers aggressive cleanup
        
        For any memory usage and threshold, when memory usage exceeds 80%
        of the threshold, it should be detected as high pressure.
        
        Validates: Requirements 4.4
        """
        # Create memory stats
        stats = MemoryStats(
            total_mb=1000.0,
            available_mb=1000.0 - (memory_percent * 10.0),
            used_mb=memory_percent * 10.0,
            percent=memory_percent,
            threshold_mb=threshold * 1000.0
        )
        
        # Verify high pressure detection
        if memory_percent > 80.0:
            assert stats.is_high_pressure is True
        else:
            assert stats.is_high_pressure is False
    
    def test_property_20_compression_is_enabled_when_available(self):
        """
        Feature: cf-bypass-phase2-optimizations, Property 20: Compression is enabled when available
        
        For any session, compression headers should be added to reduce
        memory footprint.
        
        Validates: Requirements 4.6
        """
        # Create manager
        manager = MemoryManager()
        
        # Create mock session
        mock_session = Mock()
        mock_session.headers = {}
        
        # Enable compression
        manager.enable_compression(mock_session)
        
        # Verify compression headers
        assert 'Accept-Encoding' in mock_session.headers
        assert 'gzip' in mock_session.headers['Accept-Encoding']
        assert 'deflate' in mock_session.headers['Accept-Encoding']
    
    @given(
        entries=st.integers(min_value=10, max_value=100),
        percentage=st.floats(min_value=0.1, max_value=1.0)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_cache_clear_removes_correct_percentage(
        self, entries, percentage
    ):
        """
        Property: Cache clear removes correct percentage of entries
        
        For any cache size and clear percentage, the correct number of
        entries should be removed.
        
        Validates: Requirements 4.3, 4.4
        """
        # Create manager
        manager = MemoryManager(cache_size_limit=entries * 2)
        
        # Add entries
        for i in range(entries):
            manager.add_to_cache(f"key-{i}", f"value-{i}")
        
        initial_size = len(manager._lru_cache)
        
        # Clear percentage
        removed = manager.clear_cache(percentage=percentage)
        
        # Verify correct number removed
        expected_removed = int(initial_size * percentage)
        assert removed == expected_removed
        
        # Verify remaining size
        expected_remaining = initial_size - expected_removed
        assert len(manager._lru_cache) == expected_remaining
    
    @given(
        sessions=st.integers(min_value=1, max_value=20)
    )
    @settings(max_examples=20, deadline=None)
    def test_property_session_cleanup_removes_idle_sessions(self, sessions):
        """
        Property: Session cleanup removes idle sessions
        
        For any number of idle sessions, cleanup should remove all of them.
        
        Validates: Requirements 4.2
        """
        # Create manager with 1 hour timeout
        manager = MemoryManager(idle_session_timeout_hours=1)
        
        # Add idle sessions (2 hours old)
        past_time = datetime.now() - timedelta(hours=2)
        for i in range(sessions):
            manager._session_last_used[f"session-{i}"] = past_time
        
        # Mock cleanup function
        cleaned_sessions = []
        def cleanup_func(session_id):
            cleaned_sessions.append(session_id)
        
        # Cleanup
        count = manager.cleanup_idle_sessions(cleanup_func)
        
        # Verify all sessions cleaned
        assert count == sessions
        assert len(cleaned_sessions) == sessions
        assert len(manager._session_last_used) == 0
    
    def test_property_lru_cache_access_updates_order(self):
        """
        Property: LRU cache access updates order
        
        When accessing a cache entry, it should be moved to the end (most recent).
        
        Validates: Requirements 4.3
        """
        # Create manager
        manager = MemoryManager(cache_size_limit=10)
        
        # Add entries
        for i in range(5):
            manager.add_to_cache(f"key-{i}", f"value-{i}")
        
        # Access oldest entry
        value = manager.get_from_cache("key-0")
        assert value == "value-0"
        
        # Add more entries to trigger eviction
        for i in range(5, 11):
            manager.add_to_cache(f"key-{i}", f"value-{i}")
        
        # key-0 should still be in cache (was accessed, moved to end)
        assert "key-0" in manager._lru_cache
        
        # key-1 should be evicted (was oldest and not accessed)
        assert "key-1" not in manager._lru_cache
    
    def test_property_aggressive_cleanup_reduces_memory_usage(self):
        """
        Property: Aggressive cleanup reduces memory usage
        
        Aggressive cleanup should remove sessions and cache entries.
        
        Validates: Requirements 4.4
        """
        # Create manager
        manager = MemoryManager(
            idle_session_timeout_hours=1,
            cache_size_limit=100
        )
        
        # Add idle sessions
        past_time = datetime.now() - timedelta(hours=2)
        for i in range(10):
            manager._session_last_used[f"session-{i}"] = past_time
        
        # Add cache entries
        for i in range(50):
            manager.add_to_cache(f"key-{i}", f"value-{i}")
        
        initial_sessions = len(manager._session_last_used)
        initial_cache = len(manager._lru_cache)
        
        # Mock cleanup function
        def cleanup_func(session_id):
            pass
        
        # Trigger aggressive cleanup
        stats = manager.trigger_aggressive_cleanup(cleanup_func, force_gc=False)
        
        # Verify cleanup occurred
        assert stats['sessions_cleaned'] > 0
        assert stats['cache_entries_evicted'] > 0
        
        # Verify memory usage reduced
        assert len(manager._session_last_used) < initial_sessions
        assert len(manager._lru_cache) < initial_cache
