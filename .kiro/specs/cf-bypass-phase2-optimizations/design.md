# Design Document

## Overview

This document describes the design for Phase 2 performance optimizations of the CF Bypass Service. Building on Phase 1's foundation (JS interpreter optimization, cache key optimization, parallel processing), Phase 2 introduces advanced optimizations targeting cold start performance, connection efficiency, intelligent retry strategies, and memory management.

### Goals

1. Reduce first-request latency by 70-80% through session pool warmup
2. Improve connection reuse and reduce connection overhead by 30-50%
3. Optimize retry behavior based on domain reliability (10-20% improvement)
4. Reduce memory footprint by 60-80% through streaming and cleanup
5. Provide comprehensive monitoring and auto-recovery capabilities
6. Maintain 100% backward compatibility with existing APIs

### Non-Goals

1. Changing the core CloudScraper bypass mechanism
2. Modifying existing API contracts or response formats
3. Implementing distributed session sharing across multiple instances
4. Adding authentication or authorization changes

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Application                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  /fetch    │  │ /fetch/    │  │  /warmup   │            │
│  │            │  │  parallel  │  │            │            │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘            │
└────────┼───────────────┼───────────────┼────────────────────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   CloudScraperWrapper          │
         │  ┌──────────────────────────┐  │
         │  │  Session Pool Manager    │  │
         │  │  - Warmup                │  │
         │  │  - Pool Management       │  │
         │  │  - Health Tracking       │  │
         │  └──────────────────────────┘  │
         │  ┌──────────────────────────┐  │
         │  │  Connection Pool Mgr     │  │
         │  │  - HTTP Adapter Config   │  │
         │  │  - Pool Monitoring       │  │
         │  └──────────────────────────┘  │
         │  ┌──────────────────────────┐  │
         │  │  Adaptive Retry Manager  │  │
         │  │  - Success Rate Tracking │  │
         │  │  - Dynamic Retry Config  │  │
         │  └──────────────────────────┘  │
         │  ┌──────────────────────────┐  │
         │  │  Memory Manager          │  │
         │  │  - Streaming Support     │  │
         │  │  - Session Cleanup       │  │
         │  │  - Cache Eviction        │  │
         │  └──────────────────────────┘  │
         └────────────────────────────────┘
```


## Components and Interfaces

### 1. Session Pool Manager

**Purpose**: Manage a pool of pre-initialized CloudScraper sessions for fast request handling.

**Class**: `SessionPoolManager`

**Key Methods**:
```python
class SessionPoolManager:
    def __init__(self, pool_size: int = 5, min_threshold: int = 2):
        """Initialize session pool manager"""
        
    async def warmup_domain(self, domain: str) -> None:
        """Pre-create sessions for a domain"""
        
    def get_session(self, domain: str) -> Optional[cloudscraper.CloudScraper]:
        """Get a session from the pool (returns None if pool empty)"""
        
    async def return_session(self, domain: str, session: cloudscraper.CloudScraper) -> None:
        """Return a session to the pool"""
        
    async def replenish_pool(self, domain: str) -> None:
        """Asynchronously replenish the pool"""
        
    def is_session_stale(self, session: cloudscraper.CloudScraper) -> bool:
        """Check if a session is stale"""
        
    def get_pool_stats(self) -> Dict[str, Any]:
        """Get pool statistics"""
```

**State Management**:
- `pools: Dict[str, List[SessionInfo]]` - Pool of sessions per domain
- `session_metadata: Dict[id, SessionMetadata]` - Metadata for each session
- `pool_stats: Dict[str, PoolStats]` - Statistics per domain

**SessionInfo Structure**:
```python
@dataclass
class SessionInfo:
    session: cloudscraper.CloudScraper
    created_at: datetime
    last_used: datetime
    request_count: int
    error_count: int
```

### 2. Connection Pool Manager

**Purpose**: Optimize HTTP connection pooling for better performance.

**Class**: `ConnectionPoolManager`

**Key Methods**:
```python
class ConnectionPoolManager:
    def configure_adapter(self, session: cloudscraper.CloudScraper) -> None:
        """Configure HTTP adapter with optimized settings"""
        
    def get_pool_stats(self) -> Dict[str, Any]:
        """Get connection pool statistics"""
        
    def validate_settings(self) -> List[str]:
        """Validate pool settings and return warnings"""
```

**Configuration**:
```python
OPTIMAL_POOL_CONFIG = {
    'pool_connections': 20,
    'pool_maxsize': 50,
    'max_retries': 3,
    'pool_block': False,
    'backoff_factor': 0.3
}
```

### 3. Adaptive Retry Manager

**Purpose**: Intelligently adjust retry behavior based on domain reliability.

**Class**: `AdaptiveRetryManager`

**Key Methods**:
```python
class AdaptiveRetryManager:
    def record_attempt(self, domain: str, success: bool) -> None:
        """Record a request attempt"""
        
    def get_retry_config(self, domain: str) -> RetryConfig:
        """Get retry configuration for a domain"""
        
    def get_success_rate(self, domain: str) -> float:
        """Get success rate for a domain"""
        
    def get_retry_stats(self) -> Dict[str, Any]:
        """Get retry statistics"""
```

**RetryConfig Structure**:
```python
@dataclass
class RetryConfig:
    max_retries: int
    backoff_factor: float
    retry_on_status: List[int]
```

**Retry Tiers**:
- High reliability (>90% success): 2 retries, 1.0x backoff
- Medium reliability (70-90% success): 3 retries, 1.5x backoff
- Low reliability (<70% success): 5 retries, 2.0x backoff

### 4. Memory Manager

**Purpose**: Optimize memory usage through streaming, cleanup, and eviction.

**Class**: `MemoryManager`

**Key Methods**:
```python
class MemoryManager:
    def should_stream_response(self, content_length: int) -> bool:
        """Determine if response should be streamed"""
        
    async def cleanup_idle_sessions(self) -> int:
        """Cleanup idle sessions, return count cleaned"""
        
    def check_memory_pressure(self) -> bool:
        """Check if memory usage is high"""
        
    async def trigger_aggressive_cleanup(self) -> None:
        """Trigger aggressive cleanup when memory is high"""
        
    def get_memory_stats(self) -> Dict[str, Any]:
        """Get memory usage statistics"""
```

**Memory Thresholds**:
- Streaming threshold: 10MB response size
- Idle session timeout: 1 hour
- Aggressive cleanup trigger: 80% memory usage
- Cache size limit: 10,000 entries


## Data Models

### SessionInfo
```python
@dataclass
class SessionInfo:
    session: cloudscraper.CloudScraper
    created_at: datetime
    last_used: datetime
    request_count: int
    error_count: int
    
    def is_stale(self, max_age_hours: int = 1) -> bool:
        """Check if session is stale"""
        age = datetime.now() - self.created_at
        return age.total_seconds() > (max_age_hours * 3600)
    
    def is_error_prone(self, threshold: float = 0.5) -> bool:
        """Check if session has high error rate"""
        if self.request_count == 0:
            return False
        return (self.error_count / self.request_count) > threshold
```

### RetryConfig
```python
@dataclass
class RetryConfig:
    max_retries: int
    backoff_factor: float
    retry_on_status: List[int] = field(default_factory=lambda: [403, 503, 429])
    
    def to_urllib3_retry(self) -> Retry:
        """Convert to urllib3 Retry object"""
        return Retry(
            total=self.max_retries,
            backoff_factor=self.backoff_factor,
            status_forcelist=self.retry_on_status
        )
```

### PoolStats
```python
@dataclass
class PoolStats:
    domain: str
    pool_size: int
    hits: int
    misses: int
    warmup_time_avg: float
    last_warmup: Optional[datetime]
    
    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0
```

### MemoryStats
```python
@dataclass
class MemoryStats:
    total_memory_mb: float
    used_memory_mb: float
    cache_size: int
    active_sessions: int
    idle_sessions: int
    
    @property
    def usage_percent(self) -> float:
        return (self.used_memory_mb / self.total_memory_mb) * 100
    
    @property
    def is_high_pressure(self) -> bool:
        return self.usage_percent > 80.0
```

### Configuration Model
```python
@dataclass
class Phase2Config:
    # Session Pool
    session_pool_enabled: bool = True
    session_pool_size: int = 5
    session_pool_min_threshold: int = 2
    session_max_age_hours: int = 1
    
    # Connection Pool
    connection_pool_enabled: bool = True
    pool_connections: int = 20
    pool_maxsize: int = 50
    pool_max_retries: int = 3
    
    # Adaptive Retry
    adaptive_retry_enabled: bool = True
    retry_high_reliability_max: int = 2
    retry_medium_reliability_max: int = 3
    retry_low_reliability_max: int = 5
    
    # Memory Management
    memory_optimization_enabled: bool = True
    streaming_threshold_mb: int = 10
    idle_session_timeout_hours: int = 1
    aggressive_cleanup_threshold: float = 0.8
    
    # Auto-recovery
    auto_recovery_enabled: bool = True
    degraded_error_rate_threshold: float = 0.5
    slow_response_multiplier: float = 2.0
    
    @classmethod
    def from_env(cls) -> 'Phase2Config':
        """Load configuration from environment variables"""
        return cls(
            session_pool_enabled=os.getenv('PHASE2_SESSION_POOL_ENABLED', 'true').lower() == 'true',
            session_pool_size=int(os.getenv('PHASE2_SESSION_POOL_SIZE', '5')),
            # ... load other config from env
        )
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Session Pool Properties

Property 1: Pool initialization creates expected sessions
*For any* configured domain list, after warmup completes, each domain should have a pool with size equal to the configured pool_size
**Validates: Requirements 1.1**

Property 2: Warmed domains use pool sessions
*For any* request to a warmed domain, the session used should come from the pool (pool hit), not be newly created
**Validates: Requirements 1.2**

Property 3: Pool replenishment maintains size
*For any* pool, after retrieving N sessions, the pool size should return to the original size within a reasonable time window
**Validates: Requirements 1.3**

Property 4: Pool auto-replenishment triggers correctly
*For any* pool, when size drops below min_threshold, replenishment should be triggered automatically
**Validates: Requirements 1.5**

Property 5: Stale sessions are removed
*For any* session in the pool, if it exceeds the max age, it should be removed and replaced with a fresh session
**Validates: Requirements 1.6**

Property 6: Pool statistics are accurate
*For any* sequence of pool operations (get, return, warmup), the reported statistics should accurately reflect the operations performed
**Validates: Requirements 1.7**

### Connection Pool Properties

Property 7: HTTP adapter has optimal settings
*For any* created CloudScraper session, the HTTP adapter should have pool_connections >= 20 and pool_maxsize >= 50
**Validates: Requirements 2.1, 2.2, 2.3**

Property 8: Connection pool is non-blocking
*For any* request when the pool is full, the request should not block indefinitely
**Validates: Requirements 2.5**

Property 9: Connection pool statistics are tracked
*For any* connection operation, the pool utilization statistics should be updated correctly
**Validates: Requirements 2.6**

### Adaptive Retry Properties

Property 10: Success rates are tracked accurately
*For any* sequence of requests to a domain, the calculated success rate should equal (successful_requests / total_requests)
**Validates: Requirements 3.1**

Property 11: High reliability domains use minimal retries
*For any* domain with success rate > 90%, the retry configuration should have max_retries <= 2
**Validates: Requirements 3.2**

Property 12: Medium reliability domains use moderate retries
*For any* domain with success rate between 70-90%, the retry configuration should have max_retries == 3
**Validates: Requirements 3.3**

Property 13: Low reliability domains use aggressive retries
*For any* domain with success rate < 70%, the retry configuration should have max_retries >= 5
**Validates: Requirements 3.4**

Property 14: Backoff adjusts with reliability
*For any* two domains with different success rates, the domain with lower success rate should have a higher backoff_factor
**Validates: Requirements 3.5**

Property 15: Exhausted retries return descriptive errors
*For any* request that exhausts all retry attempts, the error response should contain retry statistics (attempts, backoff used)
**Validates: Requirements 3.6**

### Memory Management Properties

Property 16: Large responses trigger streaming
*For any* response with content_length > streaming_threshold, streaming mode should be enabled
**Validates: Requirements 4.1**

Property 17: Idle sessions are cleaned up
*For any* session idle for more than the timeout period, it should be removed during cleanup
**Validates: Requirements 4.2**

Property 18: Cache implements LRU eviction
*For any* cache that exceeds size limit, the least recently used entries should be evicted first
**Validates: Requirements 4.3**

Property 19: High memory triggers aggressive cleanup
*For any* memory usage exceeding 80% of limit, aggressive cleanup should be triggered
**Validates: Requirements 4.4**

Property 20: Compression is enabled when available
*For any* session where compression is supported, the Accept-Encoding header should include compression algorithms
**Validates: Requirements 4.6**

### Health Monitoring Properties

Property 21: Performance metrics are tracked per domain
*For any* domain, after N requests, the health monitor should have tracked response times and error rates for all N requests
**Validates: Requirements 5.1**

Property 22: High error rate marks domain as degraded
*For any* domain with error rate > 50%, the domain should be marked as degraded
**Validates: Requirements 5.2**

Property 23: Degraded domains trigger session reset
*For any* domain marked as degraded, all sessions for that domain should be reset
**Validates: Requirements 5.3**

Property 24: Slow responses trigger pool refresh
*For any* domain where average response time increases by 200%, session pool refresh should be triggered
**Validates: Requirements 5.4**

### Configuration Properties

Property 25: Environment variables are loaded correctly
*For any* valid environment variable, the configuration should reflect the environment value, not the default
**Validates: Requirements 6.1**

Property 26: Invalid configuration uses safe defaults
*For any* invalid configuration value, the system should use the safe default and log a warning
**Validates: Requirements 6.2**

Property 27: Domain-specific config overrides defaults
*For any* domain with specific configuration, the domain config should take precedence over global defaults
**Validates: Requirements 6.4**

Property 28: Runtime config changes apply without restart
*For any* configuration change at runtime (where supported), the new configuration should be applied without service restart
**Validates: Requirements 6.6**

### Backward Compatibility Properties

Property 29: Existing endpoints maintain contracts
*For any* existing API endpoint, the request and response formats should remain unchanged
**Validates: Requirements 8.1, 8.2**

Property 30: Disabled optimizations fall back gracefully
*For any* optimization that is disabled, the system should fall back to Phase 1 behavior without errors
**Validates: Requirements 8.3**

Property 31: Feature flags control optimization behavior
*For any* optimization with a feature flag, enabling/disabling the flag should enable/disable the optimization
**Validates: Requirements 8.4**

Property 32: Failed optimizations degrade gracefully
*For any* optimization that fails, the system should continue operating with non-optimized behavior
**Validates: Requirements 8.5**


## Error Handling

### Session Pool Errors

1. **Pool Exhaustion**
   - Scenario: All sessions in pool are in use
   - Handling: Create new session on-demand, log warning
   - Recovery: Asynchronous pool replenishment

2. **Session Creation Failure**
   - Scenario: Unable to create new session during warmup
   - Handling: Log error, continue with reduced pool size
   - Recovery: Retry creation on next replenishment cycle

3. **Stale Session Detection**
   - Scenario: Session in pool is stale or error-prone
   - Handling: Remove from pool, create replacement
   - Recovery: Automatic replacement during next get operation

### Connection Pool Errors

1. **Connection Pool Full**
   - Scenario: All connections in use
   - Handling: Non-blocking behavior, create new connection
   - Recovery: Automatic cleanup of idle connections

2. **Connection Timeout**
   - Scenario: Connection establishment times out
   - Handling: Retry with exponential backoff
   - Recovery: Adaptive retry based on domain reliability

### Retry Errors

1. **Retry Exhaustion**
   - Scenario: All retry attempts failed
   - Handling: Return descriptive error with retry statistics
   - Recovery: Update domain success rate, adjust future retry config

2. **Backoff Calculation Error**
   - Scenario: Invalid backoff calculation
   - Handling: Use safe default backoff (1.0)
   - Recovery: Log warning, continue with default

### Memory Errors

1. **High Memory Pressure**
   - Scenario: Memory usage exceeds 80%
   - Handling: Trigger aggressive cleanup
   - Recovery: Remove idle sessions, evict cache entries

2. **Streaming Failure**
   - Scenario: Unable to stream large response
   - Handling: Fall back to non-streaming mode
   - Recovery: Log warning, continue with full load

3. **Cleanup Failure**
   - Scenario: Session cleanup encounters error
   - Handling: Log error, skip problematic session
   - Recovery: Retry cleanup on next cycle

### Configuration Errors

1. **Invalid Configuration**
   - Scenario: Configuration value is invalid
   - Handling: Use safe default, log warning
   - Recovery: Document correct values in logs

2. **Missing Environment Variable**
   - Scenario: Expected env var not set
   - Handling: Use default value
   - Recovery: Log info message with default used

## Testing Strategy

### Unit Testing

Unit tests will verify specific examples, edge cases, and error conditions for each component:

1. **Session Pool Manager Tests**
   - Test pool initialization with various sizes
   - Test session retrieval and return
   - Test stale session detection
   - Test pool replenishment logic
   - Test edge cases (empty pool, single session, etc.)

2. **Connection Pool Manager Tests**
   - Test adapter configuration
   - Test settings validation
   - Test statistics tracking
   - Test warning generation for suboptimal settings

3. **Adaptive Retry Manager Tests**
   - Test success rate calculation
   - Test retry config selection for different success rates
   - Test backoff adjustment
   - Test edge cases (no history, 100% success, 0% success)

4. **Memory Manager Tests**
   - Test streaming threshold detection
   - Test idle session cleanup
   - Test cache eviction
   - Test memory pressure detection
   - Test aggressive cleanup triggering

### Property-Based Testing

Property tests will verify universal properties across all inputs using the Hypothesis library (Python's property-based testing framework). Each test will run a minimum of 100 iterations.

**Configuration**: 
- Library: Hypothesis (Python)
- Minimum iterations: 100 per property
- Tag format: `Feature: cf-bypass-phase2-optimizations, Property {number}: {property_text}`

**Property Test Examples**:

1. **Property 1: Pool initialization**
   ```python
   @given(domains=st.lists(st.text(min_size=1), min_size=1, max_size=10),
          pool_size=st.integers(min_value=1, max_value=10))
   def test_pool_initialization(domains, pool_size):
       # Feature: cf-bypass-phase2-optimizations, Property 1
       manager = SessionPoolManager(pool_size=pool_size)
       for domain in domains:
           await manager.warmup_domain(domain)
       
       for domain in domains:
           assert len(manager.pools[domain]) == pool_size
   ```

2. **Property 10: Success rate tracking**
   ```python
   @given(requests=st.lists(st.booleans(), min_size=1, max_size=100))
   def test_success_rate_tracking(requests):
       # Feature: cf-bypass-phase2-optimizations, Property 10
       manager = AdaptiveRetryManager()
       domain = "test.com"
       
       for success in requests:
           manager.record_attempt(domain, success)
       
       expected_rate = sum(requests) / len(requests)
       actual_rate = manager.get_success_rate(domain)
       assert abs(actual_rate - expected_rate) < 0.001
   ```

3. **Property 18: LRU cache eviction**
   ```python
   @given(entries=st.lists(st.tuples(st.text(), st.text()), 
                           min_size=20, max_size=100))
   def test_lru_eviction(entries):
       # Feature: cf-bypass-phase2-optimizations, Property 18
       cache = LRUCache(max_size=10)
       
       for key, value in entries:
           cache.set(key, value)
       
       # Cache should not exceed max size
       assert len(cache) <= 10
       
       # Most recent entries should be in cache
       recent_keys = [k for k, v in entries[-10:]]
       for key in recent_keys:
           assert key in cache
   ```

### Integration Testing

Integration tests will verify end-to-end flows:

1. **Session Pool Integration**
   - Test warmup → fetch → pool hit flow
   - Test pool exhaustion → on-demand creation flow
   - Test stale session → replacement flow

2. **Adaptive Retry Integration**
   - Test request → failure → retry → success flow
   - Test success rate tracking → config adjustment flow

3. **Memory Management Integration**
   - Test large response → streaming flow
   - Test high memory → cleanup flow

4. **Health Monitoring Integration**
   - Test high error rate → degraded → recovery flow
   - Test slow response → pool refresh flow

### Performance Testing

Performance tests will measure actual improvements:

1. **Cold Start Performance**
   - Measure first request time with/without warmup
   - Target: 70-80% improvement

2. **Connection Reuse**
   - Measure connection establishment overhead
   - Target: 30-50% improvement

3. **Memory Usage**
   - Measure memory footprint with/without optimizations
   - Target: 60-80% reduction

4. **Retry Efficiency**
   - Measure retry overhead for different reliability tiers
   - Target: 10-20% improvement


## Implementation Notes

### Session Pool Implementation Strategy

1. **Warmup Strategy**
   - Warmup on service startup for configured domains
   - Asynchronous warmup to avoid blocking startup
   - Parallel warmup for multiple domains
   - Warmup endpoint for manual triggering

2. **Pool Management**
   - FIFO queue for session retrieval (oldest first)
   - Background task for continuous replenishment
   - Periodic health checks for stale detection
   - Graceful degradation when pool is empty

3. **Session Lifecycle**
   ```
   Created → Warmed → In Pool → Retrieved → In Use → Returned → In Pool
                                                    ↓
                                                 Stale → Removed
   ```

### Connection Pool Tuning

**Recommended Settings**:
```python
# For high-traffic scenarios
pool_connections = 20  # Concurrent connections per domain
pool_maxsize = 50      # Maximum pool size
max_retries = 3        # Retry attempts
backoff_factor = 0.3   # Exponential backoff multiplier
```

**Tuning Guidelines**:
- Increase `pool_connections` for more concurrent requests
- Increase `pool_maxsize` for better connection reuse
- Adjust `backoff_factor` based on server response patterns

### Adaptive Retry Implementation

**Success Rate Calculation**:
```python
# Use sliding window for recent history
window_size = 100  # Last 100 requests
success_rate = successful_requests / total_requests
```

**Retry Tier Selection**:
```python
def get_retry_tier(success_rate: float) -> RetryTier:
    if success_rate > 0.9:
        return RetryTier.HIGH  # 2 retries, 1.0x backoff
    elif success_rate > 0.7:
        return RetryTier.MEDIUM  # 3 retries, 1.5x backoff
    else:
        return RetryTier.LOW  # 5 retries, 2.0x backoff
```

### Memory Management Strategy

**Streaming Threshold**:
- Default: 10MB
- Rationale: Balance between memory usage and performance
- Configurable via environment variable

**Cleanup Strategy**:
```python
# Regular cleanup (every 5 minutes)
- Remove sessions idle > 1 hour
- Evict cache entries beyond limit

# Aggressive cleanup (when memory > 80%)
- Remove sessions idle > 30 minutes
- Evict 50% of cache entries
- Force garbage collection
```

**Memory Monitoring**:
```python
import psutil

def get_memory_usage() -> float:
    process = psutil.Process()
    return process.memory_info().rss / 1024 / 1024  # MB
```

### Configuration Management

**Environment Variables**:
```bash
# Session Pool
PHASE2_SESSION_POOL_ENABLED=true
PHASE2_SESSION_POOL_SIZE=5
PHASE2_SESSION_POOL_MIN_THRESHOLD=2
PHASE2_SESSION_MAX_AGE_HOURS=1

# Connection Pool
PHASE2_CONNECTION_POOL_ENABLED=true
PHASE2_POOL_CONNECTIONS=20
PHASE2_POOL_MAXSIZE=50
PHASE2_POOL_MAX_RETRIES=3

# Adaptive Retry
PHASE2_ADAPTIVE_RETRY_ENABLED=true
PHASE2_RETRY_HIGH_MAX=2
PHASE2_RETRY_MEDIUM_MAX=3
PHASE2_RETRY_LOW_MAX=5

# Memory Management
PHASE2_MEMORY_OPTIMIZATION_ENABLED=true
PHASE2_STREAMING_THRESHOLD_MB=10
PHASE2_IDLE_SESSION_TIMEOUT_HOURS=1
PHASE2_AGGRESSIVE_CLEANUP_THRESHOLD=0.8

# Auto-recovery
PHASE2_AUTO_RECOVERY_ENABLED=true
PHASE2_DEGRADED_ERROR_RATE=0.5
PHASE2_SLOW_RESPONSE_MULTIPLIER=2.0
```

**Domain-Specific Configuration**:
```json
{
  "qidian.com": {
    "session_pool_size": 10,
    "pool_connections": 30,
    "retry_max": 5
  },
  "default": {
    "session_pool_size": 5,
    "pool_connections": 20,
    "retry_max": 3
  }
}
```

### Monitoring and Observability

**Key Metrics to Track**:

1. **Session Pool Metrics**
   - Pool hit rate (target: >80%)
   - Average warmup time (target: <2s)
   - Pool size per domain
   - Stale session rate (target: <5%)

2. **Connection Pool Metrics**
   - Connection reuse rate (target: >70%)
   - Pool utilization (target: 50-80%)
   - Connection establishment time

3. **Retry Metrics**
   - Success rate per domain
   - Average retry count
   - Retry tier distribution

4. **Memory Metrics**
   - Total memory usage
   - Cache size
   - Active/idle session count
   - Cleanup frequency

**Stats Endpoint Response**:
```json
{
  "phase2": {
    "session_pool": {
      "enabled": true,
      "domains": {
        "qidian.com": {
          "pool_size": 5,
          "hits": 1234,
          "misses": 56,
          "hit_rate": 0.957,
          "avg_warmup_time": 1.2
        }
      }
    },
    "connection_pool": {
      "enabled": true,
      "pool_connections": 20,
      "pool_maxsize": 50,
      "utilization": 0.65
    },
    "adaptive_retry": {
      "enabled": true,
      "domains": {
        "qidian.com": {
          "success_rate": 0.95,
          "retry_tier": "high",
          "avg_retries": 0.2
        }
      }
    },
    "memory": {
      "enabled": true,
      "total_mb": 512,
      "used_mb": 256,
      "usage_percent": 50.0,
      "cache_size": 5432,
      "active_sessions": 15,
      "idle_sessions": 3
    }
  }
}
```

### Rollout Strategy

**Phase 2A: Session Pool Warmup (Week 1)**
1. Deploy with session pool enabled
2. Monitor pool hit rate and warmup time
3. Tune pool size based on traffic patterns

**Phase 2B: Connection Pool + Adaptive Retry (Week 2)**
1. Enable connection pool optimization
2. Enable adaptive retry
3. Monitor connection reuse and retry efficiency

**Phase 2C: Memory Optimization (Week 3)**
1. Enable streaming for large responses
2. Enable aggressive cleanup
3. Monitor memory usage

**Phase 2D: Health Monitoring (Week 4)**
1. Enable auto-recovery
2. Monitor degradation detection
3. Tune thresholds based on observed patterns

### Backward Compatibility Guarantees

1. **API Compatibility**
   - All existing endpoints unchanged
   - All request/response formats unchanged
   - New endpoints are additive only

2. **Feature Flags**
   - Each optimization can be disabled independently
   - Disabled optimizations fall back to Phase 1 behavior
   - No breaking changes when optimizations are disabled

3. **Graceful Degradation**
   - Optimization failures don't break core functionality
   - Automatic fallback to non-optimized paths
   - Comprehensive error logging for debugging

4. **Configuration Compatibility**
   - All Phase 1 configuration still works
   - Phase 2 configuration is additive
   - Safe defaults for all new parameters
