# Environment Variables Documentation

## Overview

This document describes all environment variables used by the CF Bypass Service, including Phase 2 performance optimizations.

---

## Phase 2 Feature Flags

### SESSION_POOL_ENABLED
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable session pool warmup feature
- **Recommended**: `true` (production)
- **Impact**: 70-80% faster first request

### CONNECTION_POOL_ENABLED
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable connection pool optimization
- **Recommended**: `true` (production)
- **Impact**: 30-50% faster connection reuse

### ADAPTIVE_RETRY_ENABLED
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable adaptive retry strategies
- **Recommended**: `true` (production)
- **Impact**: 10-20% retry efficiency improvement

### MEMORY_OPTIMIZATION_ENABLED
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable memory management features
- **Recommended**: `true` (production)
- **Impact**: 60-80% memory reduction

### HEALTH_MONITORING_ENABLED
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable health monitoring and auto-recovery
- **Recommended**: `true` (production)
- **Impact**: Improved reliability and auto-recovery

---

## Session Pool Configuration

### SESSION_POOL_SIZE
- **Type**: Integer
- **Default**: `5`
- **Range**: `1-20`
- **Description**: Number of pre-warmed sessions per domain
- **Recommended**: 
  - Development: `3`
  - Production: `5`
  - High-traffic: `10`
- **Impact**: Larger pool = higher hit rate, more memory

### SESSION_POOL_MAX_AGE_HOURS
- **Type**: Integer
- **Default**: `24`
- **Range**: `1-168` (1 hour to 1 week)
- **Description**: Maximum age of sessions before considered stale
- **Recommended**: `24` (1 day)
- **Impact**: Longer age = fewer recreations, potential staleness

### SESSION_POOL_REPLENISH_THRESHOLD
- **Type**: Float
- **Default**: `0.5`
- **Range**: `0.0-1.0`
- **Description**: Trigger replenishment when pool drops below this ratio
- **Recommended**: `0.5` (50%)
- **Impact**: Lower threshold = more aggressive replenishment

### SESSION_POOL_REPLENISH_INTERVAL_MINUTES
- **Type**: Integer
- **Default**: `5`
- **Range**: `1-60`
- **Description**: Interval for background replenishment checks
- **Recommended**: `5` minutes
- **Impact**: Shorter interval = more frequent checks, higher overhead

---

## Connection Pool Configuration

### POOL_CONNECTIONS
- **Type**: Integer
- **Default**: `20`
- **Range**: `10-50`
- **Description**: Number of connection pools to cache
- **Recommended**:
  - Development: `10`
  - Production: `20`
  - High-traffic: `30`
- **Impact**: More pools = better caching, more memory

**Warning**: Values <10 may cause performance degradation

### POOL_MAXSIZE
- **Type**: Integer
- **Default**: `50`
- **Range**: `20-200`
- **Description**: Maximum connections per pool
- **Recommended**:
  - Development: `20`
  - Production: `50`
  - High-traffic: `100`
- **Impact**: Larger size = more connection reuse, more memory

**Warning**: Should be at least 2x `POOL_CONNECTIONS`

### POOL_MAX_RETRIES
- **Type**: Integer
- **Default**: `3`
- **Range**: `0-10`
- **Description**: Maximum retries per request (when adaptive retry disabled)
- **Recommended**: `3`
- **Impact**: More retries = better reliability, longer delays

**Warning**: Values >5 may cause excessive delays

### POOL_BACKOFF_FACTOR
- **Type**: Float
- **Default**: `0.3`
- **Range**: `0.1-2.0`
- **Description**: Backoff multiplier for retries (when adaptive retry disabled)
- **Recommended**: `0.3-1.0`
- **Impact**: Higher factor = longer delays between retries

**Warning**: Values <0.1 may cause retry storms

---

## Adaptive Retry Configuration

### RETRY_HIGH_RELIABILITY_MAX
- **Type**: Integer
- **Default**: `2`
- **Range**: `1-5`
- **Description**: Max retries for high reliability domains (>90% success)
- **Recommended**: `2`
- **Impact**: Fewer retries = faster failure for reliable domains

### RETRY_MEDIUM_RELIABILITY_MAX
- **Type**: Integer
- **Default**: `3`
- **Range**: `2-7`
- **Description**: Max retries for medium reliability domains (70-90% success)
- **Recommended**: `3`
- **Impact**: Balanced retries for moderate reliability

### RETRY_LOW_RELIABILITY_MAX
- **Type**: Integer
- **Default**: `5`
- **Range**: `3-10`
- **Description**: Max retries for low reliability domains (<70% success)
- **Recommended**: `5`
- **Impact**: More retries = better success for unreliable domains

### RETRY_HIGH_BACKOFF
- **Type**: Float
- **Default**: `1.0`
- **Range**: `0.5-2.0`
- **Description**: Backoff factor for high reliability domains
- **Recommended**: `1.0`
- **Impact**: Lower backoff = faster retries

### RETRY_MEDIUM_BACKOFF
- **Type**: Float
- **Default**: `1.5`
- **Range**: `1.0-3.0`
- **Description**: Backoff factor for medium reliability domains
- **Recommended**: `1.5`
- **Impact**: Moderate backoff for balanced retry timing

### RETRY_LOW_BACKOFF
- **Type**: Float
- **Default**: `2.0`
- **Range**: `1.5-5.0`
- **Description**: Backoff factor for low reliability domains
- **Recommended**: `2.0`
- **Impact**: Higher backoff = more spacing between retries

### RETRY_SUCCESS_RATE_HIGH
- **Type**: Float
- **Default**: `0.9`
- **Range**: `0.8-0.95`
- **Description**: Threshold for high reliability tier
- **Recommended**: `0.9` (90%)
- **Impact**: Higher threshold = fewer domains in high tier

### RETRY_SUCCESS_RATE_MEDIUM
- **Type**: Float
- **Default**: `0.7`
- **Range**: `0.6-0.8`
- **Description**: Threshold for medium reliability tier
- **Recommended**: `0.7` (70%)
- **Impact**: Defines boundary between medium and low tiers

---

## Memory Management Configuration

### STREAMING_THRESHOLD_MB
- **Type**: Integer
- **Default**: `10`
- **Range**: `1-100`
- **Description**: Response size threshold for streaming mode (MB)
- **Recommended**:
  - Development: `5`
  - Production: `10`
  - High-memory: `20`
- **Impact**: Lower threshold = more streaming, less memory

### IDLE_SESSION_TIMEOUT_HOURS
- **Type**: Integer
- **Default**: `1`
- **Range**: `0.5-24`
- **Description**: Timeout for idle session cleanup (hours)
- **Recommended**:
  - Development: `0.5`
  - Production: `1`
  - Low-traffic: `2`
- **Impact**: Shorter timeout = more aggressive cleanup

### CACHE_SIZE_LIMIT
- **Type**: Integer
- **Default**: `10000`
- **Range**: `1000-100000`
- **Description**: Maximum number of cache entries
- **Recommended**:
  - Development: `1000`
  - Production: `10000`
  - High-traffic: `50000`
- **Impact**: Larger cache = better hit rate, more memory

### AGGRESSIVE_CLEANUP_THRESHOLD
- **Type**: Float
- **Default**: `0.8`
- **Range**: `0.7-0.9`
- **Description**: Memory usage threshold for aggressive cleanup
- **Recommended**: `0.8` (80%)
- **Impact**: Lower threshold = more frequent aggressive cleanup

### CLEANUP_INTERVAL_MINUTES
- **Type**: Integer
- **Default**: `5`
- **Range**: `1-60`
- **Description**: Interval for periodic cleanup checks
- **Recommended**: `5` minutes
- **Impact**: Shorter interval = more frequent cleanup, higher overhead

---

## Health Monitoring Configuration

### DEGRADATION_ERROR_THRESHOLD
- **Type**: Float
- **Default**: `0.5`
- **Range**: `0.3-0.7`
- **Description**: Error rate threshold for marking domain as degraded
- **Recommended**: `0.5` (50%)
- **Impact**: Lower threshold = more sensitive degradation detection

### SLOW_RESPONSE_MULTIPLIER
- **Type**: Float
- **Default**: `2.0`
- **Range**: `1.5-5.0`
- **Description**: Response time multiplier for slow response detection
- **Recommended**: `2.0` (200% increase)
- **Impact**: Lower multiplier = more sensitive slow response detection

### HEALTH_CHECK_INTERVAL_MINUTES
- **Type**: Integer
- **Default**: `5`
- **Range**: `1-60`
- **Description**: Interval for health check monitoring
- **Recommended**: `5` minutes
- **Impact**: Shorter interval = more frequent checks, higher overhead

---

## Configuration Examples

### Development Environment

```bash
# Minimal configuration for development
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=3
CONNECTION_POOL_ENABLED=true
POOL_CONNECTIONS=10
POOL_MAXSIZE=20
ADAPTIVE_RETRY_ENABLED=true
MEMORY_OPTIMIZATION_ENABLED=true
STREAMING_THRESHOLD_MB=5
CACHE_SIZE_LIMIT=1000
HEALTH_MONITORING_ENABLED=true
```

### Production Environment

```bash
# Optimized configuration for production
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=5
SESSION_POOL_MAX_AGE_HOURS=24
SESSION_POOL_REPLENISH_THRESHOLD=0.5

CONNECTION_POOL_ENABLED=true
POOL_CONNECTIONS=20
POOL_MAXSIZE=50
POOL_MAX_RETRIES=3
POOL_BACKOFF_FACTOR=0.3

ADAPTIVE_RETRY_ENABLED=true
RETRY_HIGH_RELIABILITY_MAX=2
RETRY_MEDIUM_RELIABILITY_MAX=3
RETRY_LOW_RELIABILITY_MAX=5
RETRY_HIGH_BACKOFF=1.0
RETRY_MEDIUM_BACKOFF=1.5
RETRY_LOW_BACKOFF=2.0

MEMORY_OPTIMIZATION_ENABLED=true
STREAMING_THRESHOLD_MB=10
IDLE_SESSION_TIMEOUT_HOURS=1
CACHE_SIZE_LIMIT=10000
AGGRESSIVE_CLEANUP_THRESHOLD=0.8

HEALTH_MONITORING_ENABLED=true
DEGRADATION_ERROR_THRESHOLD=0.5
SLOW_RESPONSE_MULTIPLIER=2.0
```

### High-Traffic Environment

```bash
# Configuration for high-traffic scenarios
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=10
SESSION_POOL_MAX_AGE_HOURS=12
SESSION_POOL_REPLENISH_THRESHOLD=0.6

CONNECTION_POOL_ENABLED=true
POOL_CONNECTIONS=30
POOL_MAXSIZE=100
POOL_MAX_RETRIES=3
POOL_BACKOFF_FACTOR=0.3

ADAPTIVE_RETRY_ENABLED=true
RETRY_HIGH_RELIABILITY_MAX=2
RETRY_MEDIUM_RELIABILITY_MAX=3
RETRY_LOW_RELIABILITY_MAX=5

MEMORY_OPTIMIZATION_ENABLED=true
STREAMING_THRESHOLD_MB=10
IDLE_SESSION_TIMEOUT_HOURS=0.5
CACHE_SIZE_LIMIT=50000
AGGRESSIVE_CLEANUP_THRESHOLD=0.75

HEALTH_MONITORING_ENABLED=true
DEGRADATION_ERROR_THRESHOLD=0.4
SLOW_RESPONSE_MULTIPLIER=1.5
```

### Low-Resource Environment

```bash
# Configuration for resource-constrained environments
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=2
SESSION_POOL_MAX_AGE_HOURS=12

CONNECTION_POOL_ENABLED=true
POOL_CONNECTIONS=10
POOL_MAXSIZE=20

ADAPTIVE_RETRY_ENABLED=true
RETRY_HIGH_RELIABILITY_MAX=1
RETRY_MEDIUM_RELIABILITY_MAX=2
RETRY_LOW_RELIABILITY_MAX=3

MEMORY_OPTIMIZATION_ENABLED=true
STREAMING_THRESHOLD_MB=5
IDLE_SESSION_TIMEOUT_HOURS=0.5
CACHE_SIZE_LIMIT=1000
AGGRESSIVE_CLEANUP_THRESHOLD=0.7

HEALTH_MONITORING_ENABLED=true
```

---

## Environment Variable Validation

### Automatic Validation

The service automatically validates environment variables on startup:

- **Type checking**: Ensures correct data types
- **Range checking**: Warns about values outside recommended ranges
- **Dependency checking**: Validates related settings
- **Default values**: Uses safe defaults for missing variables

### Validation Warnings

The service logs warnings for suboptimal configurations:

```
WARNING: pool_connections=5 is low. Recommended: 20+ for better performance
WARNING: pool_maxsize=10 < pool_connections=20. Should be at least 2x pool_connections
WARNING: cache_size_limit=100000 is very high. May consume excessive memory
```

### Configuration Endpoint

Check current configuration via API:

```bash
curl http://localhost:8000/config
```

---

## Troubleshooting

### Common Configuration Issues

#### Issue: Low Session Pool Hit Rate

**Symptoms**: Hit rate <80%

**Check**:
- `SESSION_POOL_SIZE` - May be too small
- `SESSION_POOL_MAX_AGE_HOURS` - Sessions may be expiring too quickly
- `SESSION_POOL_REPLENISH_THRESHOLD` - May need adjustment

**Solution**: Increase pool size or adjust thresholds

#### Issue: High Memory Usage

**Symptoms**: Memory usage >90%

**Check**:
- `CACHE_SIZE_LIMIT` - May be too large
- `IDLE_SESSION_TIMEOUT_HOURS` - Sessions may not be cleaned up
- `AGGRESSIVE_CLEANUP_THRESHOLD` - May be too high

**Solution**: Reduce cache size or lower cleanup threshold

#### Issue: Excessive Retries

**Symptoms**: Too many retry attempts

**Check**:
- `RETRY_*_MAX` - Max retries may be too high
- `RETRY_*_BACKOFF` - Backoff may be too aggressive
- `RETRY_SUCCESS_RATE_*` - Thresholds may be misconfigured

**Solution**: Adjust retry tiers or reduce max retries

#### Issue: Connection Errors

**Symptoms**: High connection error rate

**Check**:
- `POOL_MAXSIZE` - May be too small
- `POOL_MAX_RETRIES` - May need more retries
- `POOL_BACKOFF_FACTOR` - May need adjustment

**Solution**: Increase pool size or adjust retry settings

---

## Best Practices

### Configuration Management

1. **Use environment-specific files**: `.env.dev`, `.env.prod`
2. **Version control**: Track configuration changes
3. **Document custom values**: Explain why values differ from defaults
4. **Test changes**: Validate in staging before production

### Monitoring

1. **Track key metrics**: Hit rates, error rates, memory usage
2. **Set up alerts**: For values outside normal ranges
3. **Review regularly**: Adjust based on patterns
4. **Document learnings**: Keep notes on what works

### Optimization

1. **Start with defaults**: Use recommended values initially
2. **Measure impact**: Track metrics before and after changes
3. **Adjust gradually**: Change one variable at a time
4. **Document results**: Record what worked and what didn't

---

## References

- [PERFORMANCE_INTEGRATION.md](./PERFORMANCE_INTEGRATION.md) - Integration guide
- [PHASE2_DEPLOYMENT.md](./PHASE2_DEPLOYMENT.md) - Deployment guide
- [Phase 2 Design](./.kiro/specs/cf-bypass-phase2-optimizations/design.md) - Design document

---

**Date**: January 16, 2026  
**Version**: Phase 2.0  
**Status**: Complete ✅
