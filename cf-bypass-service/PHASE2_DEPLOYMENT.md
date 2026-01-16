# Phase 2 Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying Phase 2 performance optimizations to the CF Bypass Service. Phase 2 includes session pool warmup, connection pool optimization, adaptive retry strategies, memory management, and health monitoring.

**Deployment Strategy**: Gradual rollout with monitoring at each stage.

---

## Pre-Deployment Checklist

### 1. Verify Prerequisites

- [ ] All 105 tests passing (100% pass rate)
- [ ] Code reviewed and approved
- [ ] Documentation reviewed (PERFORMANCE_INTEGRATION.md)
- [ ] Staging environment available
- [ ] Monitoring tools configured
- [ ] Rollback plan prepared

### 2. Review Configuration

- [ ] Environment variables documented
- [ ] Configuration values validated
- [ ] Feature flags understood
- [ ] Monitoring endpoints tested

### 3. Prepare Monitoring

- [ ] `/health` endpoint accessible
- [ ] `/stats` endpoint accessible
- [ ] Logging configured
- [ ] Alerts configured (optional)

---

## Deployment Stages

### Stage 1: Staging Deployment

#### Objective
Validate Phase 2 features in staging environment before production.

#### Steps

1. **Update environment variables**:

```bash
# Enable all Phase 2 features
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=3
CONNECTION_POOL_ENABLED=true
POOL_CONNECTIONS=10
POOL_MAXSIZE=20
ADAPTIVE_RETRY_ENABLED=true
MEMORY_OPTIMIZATION_ENABLED=true
HEALTH_MONITORING_ENABLED=true
```

2. **Deploy to staging**:

```bash
# Build and deploy
cd cf-bypass-service
docker build -t cf-bypass-service:phase2 .
docker run -p 8000:8000 --env-file .env.staging cf-bypass-service:phase2
```

3. **Verify deployment**:

```bash
# Check health
curl http://staging:8000/health

# Expected response
{
  "status": "healthy",
  "phase2_enabled": true,
  "components": {
    "session_pool": "enabled",
    "connection_pool": "enabled",
    "adaptive_retry": "enabled",
    "memory_optimization": "enabled",
    "health_monitoring": "enabled"
  }
}
```

4. **Run smoke tests**:

```bash
# Test basic functionality
curl -X POST http://staging:8000/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Test warmup endpoint
curl -X POST http://staging:8000/warmup \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'

# Check statistics
curl http://staging:8000/stats
```

5. **Monitor for 24 hours**:
   - Check error rates
   - Monitor response times
   - Verify pool hit rates
   - Review memory usage

#### Success Criteria

- [ ] All endpoints responding correctly
- [ ] No increase in error rates
- [ ] Response times improved or stable
- [ ] Pool hit rate >80%
- [ ] Memory usage stable or reduced

---

### Stage 2: Production Deployment (Gradual Rollout)

#### Objective
Deploy Phase 2 features to production incrementally with monitoring at each step.

#### Step 2.1: Enable Session Pool Warmup

**Why first**: Biggest performance impact, lowest risk.

1. **Update production environment**:

```bash
# Enable only session pool
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=5
SESSION_POOL_MAX_AGE_HOURS=24
SESSION_POOL_REPLENISH_THRESHOLD=0.5

# Keep others disabled
CONNECTION_POOL_ENABLED=false
ADAPTIVE_RETRY_ENABLED=false
MEMORY_OPTIMIZATION_ENABLED=false
HEALTH_MONITORING_ENABLED=false
```

2. **Deploy and restart service**

3. **Monitor for 2-4 hours**:
   - First request times (should be 70-80% faster)
   - Pool hit rate (target >80%)
   - Error rates (should be stable)
   - Memory usage (should be stable)

4. **Verify metrics**:

```bash
curl http://production:8000/stats | jq '.session_pool'

# Expected
{
  "example.com": {
    "size": 5,
    "hits": 150,
    "misses": 10,
    "hit_rate": 0.9375
  }
}
```

**Success Criteria**:
- [ ] Pool hit rate >80%
- [ ] First request time improved 70-80%
- [ ] No increase in errors
- [ ] Memory usage stable

**If issues**: Disable session pool, investigate, fix, retry.

---

#### Step 2.2: Enable Connection Pool

**Why second**: Improves connection reuse, moderate risk.

1. **Update production environment**:

```bash
# Keep session pool enabled
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=5

# Enable connection pool
CONNECTION_POOL_ENABLED=true
POOL_CONNECTIONS=20
POOL_MAXSIZE=50
POOL_MAX_RETRIES=3
POOL_BACKOFF_FACTOR=0.3

# Keep others disabled
ADAPTIVE_RETRY_ENABLED=false
MEMORY_OPTIMIZATION_ENABLED=false
HEALTH_MONITORING_ENABLED=false
```

2. **Deploy and restart service**

3. **Monitor for 2-4 hours**:
   - Connection reuse rate (target 30-50% improvement)
   - Response times (should improve)
   - Connection errors (should be low)
   - Pool statistics

4. **Verify metrics**:

```bash
curl http://production:8000/stats | jq '.connection_pool'

# Expected
{
  "example.com": {
    "pool_hits": 450,
    "pool_misses": 50,
    "hit_rate": 0.9,
    "connection_errors": 2
  }
}
```

**Success Criteria**:
- [ ] Connection hit rate >70%
- [ ] Response times improved 30-50%
- [ ] Connection errors <5%
- [ ] No service disruption

**If issues**: Disable connection pool, investigate, fix, retry.

---

#### Step 2.3: Enable Adaptive Retry

**Why third**: Optimizes retry behavior, low risk.

1. **Update production environment**:

```bash
# Keep session pool and connection pool enabled
SESSION_POOL_ENABLED=true
CONNECTION_POOL_ENABLED=true

# Enable adaptive retry
ADAPTIVE_RETRY_ENABLED=true
RETRY_HIGH_RELIABILITY_MAX=2
RETRY_MEDIUM_RELIABILITY_MAX=3
RETRY_LOW_RELIABILITY_MAX=5
RETRY_HIGH_BACKOFF=1.0
RETRY_MEDIUM_BACKOFF=1.5
RETRY_LOW_BACKOFF=2.0

# Keep others disabled
MEMORY_OPTIMIZATION_ENABLED=false
HEALTH_MONITORING_ENABLED=false
```

2. **Deploy and restart service**

3. **Monitor for 2-4 hours**:
   - Retry efficiency (target 10-20% improvement)
   - Domain success rates
   - Retry tier distribution
   - Overall error rates

4. **Verify metrics**:

```bash
curl http://production:8000/stats | jq '.adaptive_retry'

# Expected
{
  "example.com": {
    "success_rate": 0.95,
    "tier": "high",
    "max_retries": 2,
    "total_attempts": 1000,
    "successful": 950
  }
}
```

**Success Criteria**:
- [ ] Retry efficiency improved 10-20%
- [ ] Domain tiers correctly assigned
- [ ] No increase in failed requests
- [ ] Retry overhead reduced

**If issues**: Disable adaptive retry, investigate, fix, retry.

---

#### Step 2.4: Enable Memory Optimization

**Why fourth**: Reduces memory usage, moderate risk.

1. **Update production environment**:

```bash
# Keep previous features enabled
SESSION_POOL_ENABLED=true
CONNECTION_POOL_ENABLED=true
ADAPTIVE_RETRY_ENABLED=true

# Enable memory optimization
MEMORY_OPTIMIZATION_ENABLED=true
STREAMING_THRESHOLD_MB=10
IDLE_SESSION_TIMEOUT_HOURS=1
CACHE_SIZE_LIMIT=10000
AGGRESSIVE_CLEANUP_THRESHOLD=0.8

# Keep health monitoring disabled
HEALTH_MONITORING_ENABLED=false
```

2. **Deploy and restart service**

3. **Monitor for 4-8 hours**:
   - Memory usage (target 60-80% reduction)
   - Cache hit rates
   - Session cleanup frequency
   - Response times (should be stable)

4. **Verify metrics**:

```bash
curl http://production:8000/stats | jq '.memory'

# Expected
{
  "total_mb": 16384,
  "used_mb": 2048,
  "usage_percent": 12.5,
  "is_high_pressure": false,
  "cache_size": 5000,
  "cache_utilization": 0.5
}
```

**Success Criteria**:
- [ ] Memory usage reduced 60-80%
- [ ] No memory leaks detected
- [ ] Cache working efficiently
- [ ] Response times stable

**If issues**: Disable memory optimization, investigate, fix, retry.

---

#### Step 2.5: Enable Health Monitoring

**Why last**: Adds monitoring and auto-recovery, lowest risk.

1. **Update production environment**:

```bash
# Enable all Phase 2 features
SESSION_POOL_ENABLED=true
CONNECTION_POOL_ENABLED=true
ADAPTIVE_RETRY_ENABLED=true
MEMORY_OPTIMIZATION_ENABLED=true

# Enable health monitoring
HEALTH_MONITORING_ENABLED=true
DEGRADATION_ERROR_THRESHOLD=0.5
SLOW_RESPONSE_MULTIPLIER=2.0
```

2. **Deploy and restart service**

3. **Monitor for 24 hours**:
   - Health status per domain
   - Auto-recovery triggers
   - Performance metrics
   - Overall service health

4. **Verify metrics**:

```bash
curl http://production:8000/stats | jq '.health'

# Expected
{
  "example.com": {
    "status": "healthy",
    "error_rate": 0.05,
    "avg_response_time": 0.5,
    "last_check": "2026-01-16T10:30:00Z"
  }
}
```

**Success Criteria**:
- [ ] Health monitoring working correctly
- [ ] Auto-recovery triggers appropriately
- [ ] No false positives
- [ ] Service reliability improved

**If issues**: Disable health monitoring, investigate, fix, retry.

---

### Stage 3: Full Production Deployment

#### Objective
All Phase 2 features enabled and stable in production.

#### Final Configuration

```bash
# Session Pool
SESSION_POOL_ENABLED=true
SESSION_POOL_SIZE=5
SESSION_POOL_MAX_AGE_HOURS=24
SESSION_POOL_REPLENISH_THRESHOLD=0.5

# Connection Pool
CONNECTION_POOL_ENABLED=true
POOL_CONNECTIONS=20
POOL_MAXSIZE=50
POOL_MAX_RETRIES=3
POOL_BACKOFF_FACTOR=0.3

# Adaptive Retry
ADAPTIVE_RETRY_ENABLED=true
RETRY_HIGH_RELIABILITY_MAX=2
RETRY_MEDIUM_RELIABILITY_MAX=3
RETRY_LOW_RELIABILITY_MAX=5
RETRY_HIGH_BACKOFF=1.0
RETRY_MEDIUM_BACKOFF=1.5
RETRY_LOW_BACKOFF=2.0

# Memory Optimization
MEMORY_OPTIMIZATION_ENABLED=true
STREAMING_THRESHOLD_MB=10
IDLE_SESSION_TIMEOUT_HOURS=1
CACHE_SIZE_LIMIT=10000
AGGRESSIVE_CLEANUP_THRESHOLD=0.8

# Health Monitoring
HEALTH_MONITORING_ENABLED=true
DEGRADATION_ERROR_THRESHOLD=0.5
SLOW_RESPONSE_MULTIPLIER=2.0
```

#### Validation

1. **Run comprehensive tests**:

```bash
# Health check
curl http://production:8000/health

# Statistics
curl http://production:8000/stats

# Configuration
curl http://production:8000/config
```

2. **Verify all metrics**:
   - [ ] Session pool hit rate >80%
   - [ ] Connection pool hit rate >70%
   - [ ] Retry efficiency improved 10-20%
   - [ ] Memory usage reduced 60-80%
   - [ ] Health monitoring active

3. **Monitor for 1 week**:
   - Daily review of metrics
   - Weekly performance report
   - Adjust configuration as needed

---

## Rollback Procedures

### Quick Rollback (Emergency)

**If critical issues occur**, disable all Phase 2 features immediately:

```bash
# Disable all Phase 2 features
SESSION_POOL_ENABLED=false
CONNECTION_POOL_ENABLED=false
ADAPTIVE_RETRY_ENABLED=false
MEMORY_OPTIMIZATION_ENABLED=false
HEALTH_MONITORING_ENABLED=false

# Restart service
docker restart cf-bypass-service
```

### Selective Rollback

**If specific feature causes issues**, disable only that feature:

```bash
# Example: Disable only memory optimization
MEMORY_OPTIMIZATION_ENABLED=false

# Keep others enabled
SESSION_POOL_ENABLED=true
CONNECTION_POOL_ENABLED=true
ADAPTIVE_RETRY_ENABLED=true
HEALTH_MONITORING_ENABLED=true

# Restart service
docker restart cf-bypass-service
```

### Rollback Verification

After rollback:
1. Verify service is healthy
2. Check error rates returned to normal
3. Monitor for 1 hour
4. Investigate root cause
5. Fix issue
6. Retry deployment

---

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Session Pool**:
   - Hit rate (target >80%)
   - Pool size
   - Replenishment frequency

2. **Connection Pool**:
   - Hit rate (target >70%)
   - Connection errors
   - Pool utilization

3. **Adaptive Retry**:
   - Success rates per domain
   - Retry tier distribution
   - Retry overhead

4. **Memory**:
   - Memory usage (target 60-80% reduction)
   - Cache size
   - Cleanup frequency

5. **Health**:
   - Domain health status
   - Auto-recovery triggers
   - Error rates

### Recommended Alerts

```yaml
# Example alert configuration
alerts:
  - name: "Low Session Pool Hit Rate"
    condition: session_pool_hit_rate < 0.8
    severity: warning
    
  - name: "High Connection Errors"
    condition: connection_errors > 0.1
    severity: critical
    
  - name: "High Memory Usage"
    condition: memory_usage_percent > 0.9
    severity: warning
    
  - name: "Domain Degraded"
    condition: domain_status == "degraded"
    severity: critical
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Low Session Pool Hit Rate

**Symptoms**: Hit rate <80%

**Possible Causes**:
- Pool size too small
- Sessions expiring too quickly
- High traffic variability

**Solutions**:
1. Increase `SESSION_POOL_SIZE`
2. Increase `SESSION_POOL_MAX_AGE_HOURS`
3. Lower `SESSION_POOL_REPLENISH_THRESHOLD`

#### Issue 2: High Connection Errors

**Symptoms**: Connection errors >5%

**Possible Causes**:
- Pool size too small
- Network issues
- Domain reliability issues

**Solutions**:
1. Increase `POOL_MAXSIZE`
2. Increase `POOL_MAX_RETRIES`
3. Check network connectivity
4. Review domain reliability

#### Issue 3: High Memory Usage

**Symptoms**: Memory usage >90%

**Possible Causes**:
- Cache size too large
- Idle sessions not cleaned up
- Memory leaks

**Solutions**:
1. Reduce `CACHE_SIZE_LIMIT`
2. Lower `IDLE_SESSION_TIMEOUT_HOURS`
3. Enable aggressive cleanup
4. Check for memory leaks

#### Issue 4: Excessive Retries

**Symptoms**: Too many retry attempts

**Possible Causes**:
- Retry tiers misconfigured
- Domain success rates incorrect
- Backoff too aggressive

**Solutions**:
1. Adjust retry tier thresholds
2. Reduce max retries per tier
3. Review domain success rates
4. Adjust backoff factors

---

## Post-Deployment

### Week 1: Daily Monitoring

- [ ] Day 1: Check all metrics, verify improvements
- [ ] Day 2: Review error logs, adjust configuration
- [ ] Day 3: Analyze performance trends
- [ ] Day 4: Fine-tune pool sizes
- [ ] Day 5: Optimize retry tiers
- [ ] Day 6: Review memory usage patterns
- [ ] Day 7: Generate weekly report

### Week 2-4: Weekly Monitoring

- [ ] Week 2: Monitor stability, minor adjustments
- [ ] Week 3: Analyze long-term trends
- [ ] Week 4: Final optimization, document learnings

### Ongoing Maintenance

- **Monthly**: Review performance metrics
- **Quarterly**: Optimize configuration based on patterns
- **Annually**: Evaluate for further improvements

---

## Success Metrics

### Performance Improvements

- [ ] Cold start: 70-80% faster
- [ ] Connection reuse: 30-50% improvement
- [ ] Memory usage: 60-80% reduction
- [ ] Retry efficiency: 10-20% improvement
- [ ] Overall: 95-98% first request improvement

### Operational Metrics

- [ ] Service uptime: >99.9%
- [ ] Error rate: <1%
- [ ] Response time: <500ms (p95)
- [ ] Memory usage: <50% of available

### Business Metrics

- [ ] User satisfaction: Improved
- [ ] Cost efficiency: Reduced resource usage
- [ ] Scalability: Increased throughput

---

## References

- [PERFORMANCE_INTEGRATION.md](./PERFORMANCE_INTEGRATION.md) - Integration guide
- [OPTIMIZATION_SUMMARY.md](../OPTIMIZATION_SUMMARY.md) - Optimization summary
- [Phase 2 Design](./.kiro/specs/cf-bypass-phase2-optimizations/design.md) - Design document
- [Phase 2 Requirements](./.kiro/specs/cf-bypass-phase2-optimizations/requirements.md) - Requirements

---

**Date**: January 16, 2026  
**Version**: Phase 2.0  
**Status**: Ready for Deployment ✅
