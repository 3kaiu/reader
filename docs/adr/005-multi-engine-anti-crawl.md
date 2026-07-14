# ADR 005: Multi-Engine Architecture and Anti-Crawl Strategy

## Status
Accepted

## Context
The Nexus Reader fetches content from various book source websites, many of which employ anti-bot protections (Cloudflare, custom WAF, rate limiting). A single fetch strategy is insufficient.

## Decision
We implement a multi-engine architecture with a fallback chain:

### Engine Registry (`nexus-engine/src/engine_registry.rs`)
- Caches compiled engines per source ID
- Supports both `NxsEngine` and `LegadoEngine` via `BookEngine`/`BookEngineRuntime` traits
- LRU eviction (max 2000 engines)

### Anti-Crawl Fallback Chain (`nexus-engine/src/anti_crawl/chain.rs`)
```
FallbackChain.execute(ctx) ->
  1. DirectHTTP (fast, no overhead)
       ↓ fails / CF challenge detected
  2. PrimpHTTP (browser-like TLS fingerprint)
       ↓ fails / CF challenge detected  
  3. BrowserProbe (headless Chromium via bypass service)
       ↓ fails
  4. Fail with aggregated error
```

### Anti-Crawl Strategies (`nexus-engine/src/anti_crawl/strategies.rs`)
1. **DirectHTTP** (`DirectHttpStrategy`):
   - Raw reqwest with connection pooling
   - Domain-based connection limits
   - User-agent rotation
   - Fastest, lowest overhead

2. **PrimpHTTP** (`PrimpHttpStrategy`):
   - Uses `curl_cffi` via Python subprocess (or `primp` crate)
   - Mimics Chrome TLS fingerprint (JA3)
   - Handles Cloudflare Turnstile challenges
   - Medium overhead

3. **BrowserProbe** (`BrowserProbeStrategy`):
   - Calls Python bypass service (`bypass/`) via HTTP
   - Full headless Chromium with `playwright`/`patchright`
   - Executes JavaScript, solves Turnstile
   - Highest overhead, used as last resort

### Circuit Breaker (`nexus-engine/src/circuit_breaker.rs`)
- Per-source state: `Closed` → `Open` → `HalfOpen`
- Opens after 3 consecutive failures
- 60s cooldown before `HalfOpen`
- Single probe in `HalfOpen` to test recovery

### Domain Profiling (`nexus-engine/src/engine.py` / `DomainRegistry`)
- Tracks success/failure per method per domain
- Learns best method per domain
- Adapts strategy priority based on history

## Consequences
**Positive:**
- Resilient to various anti-bot measures
- Automatic strategy selection
- Observability via metrics per strategy
- Configurable per-source

**Negative:**
- Complexity in fallback orchestration
- Multiple external dependencies (Python, Node.js, Chrome)
- Latency increases with each fallback step
- Resource intensive (browser probes)

## Configuration
Environment variables:
- `CF_SERVICE_URL`: Bypass service URL
- `CF_PROXY`: Proxy for bypass service
- `BYPASS_MAX_CONCURRENCY`: Max concurrent bypass requests (default 20)
- `BYPASS_MAX_PER_DOMAIN`: Max per-domain (default 3)

## Monitoring
Metrics exposed:
- `anti_crawl_attempts_total{strategy, result}`
- `anti_crawl_latency_seconds{strategy}`
- `circuit_breaker_state{source, state}`
- `domain_best_method{domain, method}`