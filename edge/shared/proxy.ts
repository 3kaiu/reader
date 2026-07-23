/**
 * Proxy Utilities
 * Centralized proxy logic for forwarding requests to backend services
 */

import type { CorsEnvSlice } from './cors.ts'
import { getCorsHeaders } from './cors.ts'
import { generateCacheKey, getFromCache, saveToCache } from './cache.ts'
import { getRequestId, REQUEST_ID_HEADER } from './request-id.ts'
import type {
  AnalyticsEngineDatasetLike,
  ExecutionContextLike,
  KVNamespaceLike,
  WorkerEnv,
} from './types.ts'

export interface ProxyOptions {
  useCache?: boolean
  cacheTTL?: number
  kv?: KVNamespaceLike
  ctx?: ExecutionContextLike
  analytics?: AnalyticsEngineDatasetLike
  corsEnv?: CorsEnvSlice
}

function recordCacheMetric(
  analytics: AnalyticsEngineDatasetLike | undefined,
  ctx: ExecutionContextLike | undefined,
  data: { layer: 'proxy'; result: 'hit' | 'miss' | 'set'; latencyMs?: number }
) {
  if (!analytics) return;
  const write = async () => {
    try {
      // blobs: layer, result ; doubles: latencyMs?, count
      analytics.writeDataPoint({
        blobs: [data.layer, data.result],
        doubles: [data.latencyMs ?? 0, 1.0],
        indexes: ['cache_metrics'],
      });
    } catch {
      // ignore metrics failures
    }
  };
  if (ctx) ctx.waitUntil(write());
  else void write();
}

export async function proxyRequest(
  request: Request,
  targetUrl: string,
  path: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const { useCache = false, cacheTTL = 0, kv, ctx, corsEnv } = options
  const url = new URL(path, targetUrl);
  const origin = request.headers.get('Origin') || '';
  const requestId = getRequestId(request)
  
  // NOTE: Auto-decoding of URL parameters (e.g. %2F, %3A) was removed for security.
  // The frontend must encode URL parameters correctly before sending requests.
  // Auto-decoding here could be exploited for SSRF attacks.

  // Try cache for GET requests — but skip if request has authentication headers.
  // Authenticated responses are user-specific and must not be cached/shared across users.
  const hasAuthHeaders =
    request.headers.has('authorization') || request.headers.has('cookie');
  const cacheKey = generateCacheKey(path, Object.fromEntries(url.searchParams));
  if (useCache && request.method === 'GET' && kv && !hasAuthHeaders) {
    const t0 = Date.now();
    const cached = await getFromCache(kv, cacheKey);
    if (cached) {
      recordCacheMetric(options.analytics, ctx, { layer: 'proxy', result: 'hit', latencyMs: Date.now() - t0 });
      return new Response(cached.body, {
        headers: {
          'Content-Type': cached.contentType,
          'X-Cache': 'HIT',
          [REQUEST_ID_HEADER]: requestId,
          ...getCorsHeaders(origin, corsEnv),
        },
      });
    }
    recordCacheMetric(options.analytics, ctx, { layer: 'proxy', result: 'miss', latencyMs: Date.now() - t0 });
  }
  
  // Forward request
  const headers = new Headers(request.headers);
  headers.delete('host');

  // Extract real client IP from Cloudflare header before stripping.
  // cf-connecting-ip is set by Cloudflare infrastructure (not spoofable by the browser),
  // so reading it here and forwarding as X-Forwarded-For is safe.
  const realIp = headers.get('cf-connecting-ip');

  // Strip CF-* headers to prevent IP spoofing downstream
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');

  // Forward real client IP to backend for rate limiting (SmartIpKeyExtractor)
  if (realIp) {
    headers.set('x-forwarded-for', realIp);
  }

  // Configurable fetch timeout (15s default, 300s for streaming endpoints)
  const isStreaming = path.includes('/stream') || request.headers.get('Accept')?.includes('text/event-stream');
  const FETCH_TIMEOUT_MS = isStreaming ? 300_000 : 15_000;

  // Request body size limit: reject payloads > 10MB
  const MAX_BODY_SIZE = 10 * 1024 * 1024;
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds maximum size of 10MB',
      requestId,
    }), {
      status: 413,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin, corsEnv),
      },
    });
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      ...(request.method !== 'GET' && request.method !== 'HEAD' ? { duplex: 'half' } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    const newHeaders = new Headers(response.headers);
    Object.entries(getCorsHeaders(origin, corsEnv)).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    newHeaders.set('X-Cache', 'MISS');
    newHeaders.set(REQUEST_ID_HEADER, requestId);
    
    // SSE responses - stream directly without caching
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/event-stream')) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }
    
    // Cache successful GET responses (skip if request had auth headers — user-specific)
    // Also skip caching for large responses to avoid OOM (128MB Worker memory limit)
    const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB
    const contentLength = response.headers.get('Content-Length');
    const isTooLarge = contentLength && parseInt(contentLength, 10) > MAX_CACHE_SIZE;

    if (useCache && response.ok && request.method === 'GET' && kv && ctx && !hasAuthHeaders && !isTooLarge) {
      const body = await response.text();
      // Double-check actual size (Content-Length may be missing or inaccurate)
      if (body.length <= MAX_CACHE_SIZE) {
        ctx.waitUntil(saveToCache(kv, cacheKey, body, contentType || 'application/json', cacheTTL));
        recordCacheMetric(options.analytics, ctx, { layer: 'proxy', result: 'set' });
      }

      return new Response(body, {
        status: response.status,
        headers: newHeaders,
      });
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    // Graceful timeout handling
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn('Proxy request timed out after', FETCH_TIMEOUT_MS, 'ms');
      return new Response(JSON.stringify({
        code: 'GATEWAY_TIMEOUT',
        message: 'Backend service timed out',
        requestId,
      }), {
        status: 504,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin, corsEnv),
        },
      });
    }
    console.error('Proxy error:', error);
    // Differentiate error types for proper status codes
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isConnectionError = errorMessage.includes('ECONNREFUSED')
      || errorMessage.includes('ENOTFOUND')
      || errorMessage.includes('getaddrinfo')
      || errorMessage.includes('connect')
      || errorMessage.includes('DNS');
    const statusCode = isConnectionError ? 502 : 500;
    const code = isConnectionError ? 'BAD_GATEWAY' : 'INTERNAL_ERROR';
    const message = isConnectionError
      ? 'Backend service unreachable'
      : 'Unexpected backend error';
    return new Response(JSON.stringify({
      code,
      message,
      details: (corsEnv && typeof corsEnv === 'object' && 'ENVIRONMENT' in corsEnv && (corsEnv as Record<string,unknown>).ENVIRONMENT === 'development') ? errorMessage : undefined,
      requestId,
    }), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...(isConnectionError ? { 'Retry-After': '10' } : {}),
        ...getCorsHeaders(origin, corsEnv),
      },
    });
  }
}

/**
 * Backward-compatible overload used by worker entrypoints:
 * - `entry.ts` (current)
 * - `unified-worker.ts` (compat shim)
 * proxyRequest(request, env)
 */
type ProxyEnvLike = Pick<
  WorkerEnv,
  | 'NEXUS_API_URL'
  | 'ENABLE_CACHE'
  | 'CONTENT_CACHE_KV'
  | 'CORS_EXTRA_ORIGINS'
> & {
  nexusApiUrl?: string
  FRONTEND_URL?: string
}

export async function proxyRequestWithEnv(
  request: Request,
  env: ProxyEnvLike,
  ctx?: ExecutionContextLike,
  options?: { useCache?: boolean }
): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = env.NEXUS_API_URL || env.nexusApiUrl || ''
  const useCache = options?.useCache ?? (String(env.ENABLE_CACHE ?? 'true') === 'true')
  const kv = env.CONTENT_CACHE_KV

  return proxyRequest(request, targetUrl, url.pathname + url.search, {
    useCache,
    cacheTTL: 120, // NOTE: Hardcoded TTL ignores backend Cache-Control header.
    // TODO: Parse the backend's Cache-Control max-age directive instead of
    // using a fixed value. This would let dynamic content expire sooner and
    // static content be cached longer. See: stableHash64 collision docs.
    kv,
    ctx,
    corsEnv: env,
  })
}
