# CF Bypass Service - Optimization Guide

This document summarizes the performance optimizations and operational best practices for the CF Bypass Service.

## Performance Features

The service includes several integrated managers to optimize throughput and resource usage:

- **Session Pool**: Pre-warms CloudScraper sessions to eliminate cold-start overhead.
- **Connection Pool**: Reuses HTTP connections to reduce TCP/TLS handshake latency.
- **Adaptive Retry**: Adjusts retry counts and backoff based on domain-specific success rates.
- **Memory Management**: Implements streaming for large responses and automated cleanup for idle sessions.
- **Health Monitoring**: Tracks success rates and response times, triggering auto-recovery for degraded domains.

## Configuration

All optimizations are controlled via environment variables. For a full list of available settings, refer to `phase2_config.py`.

### Recommended Production Settings
```bash
PHASE2_SESSION_POOL_ENABLED=true
PHASE2_SESSION_POOL_SIZE=5
PHASE2_CONNECTION_POOL_ENABLED=true
PHASE2_ADAPTIVE_RETRY_ENABLED=true
PHASE2_MEMORY_OPTIMIZATION_ENABLED=true
PHASE2_HEALTH_MONITORING_ENABLED=true
```

## Monitoring & Operations

### Health & Statistics
- `GET /health`: Basic service health check.
- `GET /stats`: Detailed metrics from all optimization managers.

### Maintenance
- `POST /warmup`: Manually refill the session pool for a specific domain.
- `POST /recover`: Force-reset all sessions and health stats for a problematic domain.

## Deployment Strategy
We recommend a gradual rollout:
1. Enable **Session Pool** (highest impact, lowest risk).
2. Enable **Connection Pool** & **Adaptive Retry**.
3. Enable **Memory Optimization** & **Health Monitoring**.
