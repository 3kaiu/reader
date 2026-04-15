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
  
  // Fix double-encoding issue for URL parameters
  if (url.searchParams.has('url')) {
    const urlParam = url.searchParams.get('url');
    try {
      if (urlParam && (urlParam.includes('%2F') || urlParam.includes('%3A'))) {
        const decoded = decodeURIComponent(urlParam);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          url.searchParams.set('url', decoded);
        }
      }
    } catch (e) {
      console.warn('Failed to decode URL parameter:', e);
    }
  }
  
  // Try cache for GET requests
  const cacheKey = generateCacheKey(path, Object.fromEntries(url.searchParams));
  if (useCache && request.method === 'GET' && kv) {
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
  
  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      ...(request.method !== 'GET' && request.method !== 'HEAD' ? { duplex: 'half' } : {}),
    });
    
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
    
    // Cache successful GET responses
    if (useCache && response.ok && request.method === 'GET' && kv && ctx) {
      const body = await response.text();
      ctx.waitUntil(saveToCache(kv, cacheKey, body, contentType || 'application/json', cacheTTL));
      recordCacheMetric(options.analytics, ctx, { layer: 'proxy', result: 'set' });
      
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
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable',
      details: 'Backend service is starting up, please retry in 30 seconds',
      requestId,
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '30',
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
  | 'NEXUS_LITE_URL'
  | 'ENABLE_CACHE'
  | 'CONTENT_CACHE_KV'
  | 'CORS_EXTRA_ORIGINS'
> & {
  nexusLiteUrl?: string
  FRONTEND_URL?: string
}

export async function proxyRequestWithEnv(
  request: Request,
  env: ProxyEnvLike,
  ctx?: ExecutionContextLike
): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = env.NEXUS_LITE_URL || env.nexusLiteUrl || ''
  const useCache = String(env.ENABLE_CACHE ?? 'true') === 'true'
  const kv = env.CONTENT_CACHE_KV

  return proxyRequest(request, targetUrl, url.pathname + url.search, {
    useCache,
    cacheTTL: 300,
    kv,
    ctx,
    corsEnv: env,
  })
}
