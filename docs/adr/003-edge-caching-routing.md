# ADR 003: Edge Worker Caching and Routing Strategy

## Status
Accepted

## Context
The Cloudflare Worker (`edge/`) acts as a proxy between the frontend and the Rust API server. It handles:
- Request validation and CORS
- Request proxying to backend
- Response caching in Cloudflare KV
- Request ID propagation for tracing

## Decision
We will implement selective edge caching with explicit path configuration:

1. **Edge-handled paths** (cached at edge):
   - `/api/search` - search results are cacheable
   - `/api/book` - book info rarely changes
   - `/api/chapters` - chapter lists are stable
   - `/api/content` - chapter content is immutable once fetched
   - `/api/batch/content` - batch content requests

2. **Direct paths** (bypass edge, go straight to API):
   - `/api/sources` - source management (mutations)
   - `/api/bookshelf` - user-specific data
   - `/api/groups` - user-specific data
   - `/api/replace_rules` - user-specific data
   - `/ws/` - WebSocket connections

3. **Edge Configuration** (in `contracts/http-routes.json`):
   ```json
   {
     "routing": {
       "edgeHandledApiPrefixes": [
         "/api/search",
         "/api/book",
         "/api/chapters",
         "/api/content",
         "/api/batch/content"
       ]
     }
   }
   ```

## Implementation
1. **Contract**: Updated `contracts/http-routes.json` with `edgeHandledApiPrefixes`
2. **Dispatcher** (`edge/entry/dispatch.ts`): Checks path against edge-handled prefixes
3. **Proxy** (`edge/shared/proxy.ts`): Accepts `useCache` option per-request
4. **Cache**: Cloudflare KV**: Stores responses with 120s TTL

## Consequences
**Positive:**
- Reduced backend load for read-heavy endpoints
- Lower latency for cached responses (served from edge)
- Backend protected from traffic spikes

**Negative:**
- Cache invalidation complexity (120s TTL may serve stale data)
- Mutations on cached paths require manual cache purge
- Additional complexity in dispatcher logic

## Configuration
- KV Namespace: `CONTENT_CACHE_KV` (bound in `wrangler.toml`)
- Cache TTL: 120 seconds (configurable via `cacheTTL` option)
- Cache enabled by default (`ENABLE_CACHE=true`)