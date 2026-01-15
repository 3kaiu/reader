/**
 * Proxy Utilities
 * Centralized proxy logic for forwarding requests to backend services
 */

import { getCorsHeaders } from './cors.ts';
import { generateCacheKey, getFromCache, saveToCache } from './cache.ts';

export interface ProxyOptions {
  useCache?: boolean;
  cacheTTL?: number;
  kv?: KVNamespace;
  ctx?: ExecutionContext;
}

export async function proxyRequest(
  request: Request,
  targetUrl: string,
  path: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const { useCache = false, cacheTTL = 0, kv, ctx } = options;
  const url = new URL(path, targetUrl);
  const origin = request.headers.get('Origin') || '';
  
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
    const cached = await getFromCache(kv, cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: {
          'Content-Type': cached.contentType,
          'X-Cache': 'HIT',
          ...getCorsHeaders(origin),
        },
      });
    }
  }
  
  // Forward request
  const headers = new Headers(request.headers);
  headers.delete('host');
  
  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.clone().text() 
        : null,
    });
    
    const newHeaders = new Headers(response.headers);
    Object.entries(getCorsHeaders(origin)).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    newHeaders.set('X-Cache', 'MISS');
    
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
      error: 'Service temporarily unavailable',
      message: 'Backend service is starting up, please retry in 30 seconds',
      retryAfter: 30
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '30',
        ...getCorsHeaders(origin),
      },
    });
  }
}
