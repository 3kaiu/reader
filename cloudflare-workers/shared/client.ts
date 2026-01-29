/**
 * Shared Service calling client for Workers
 * Handles communication with nexus-lite and cf-bypass-service
 */

import { getCorsHeaders } from './cors.ts';

export interface ProxyOptions {
  useCache?: boolean;
  cacheTTL?: number;
  kv?: any;
  ctx?: any;
  apiRoute?: boolean;
}

export async function callService(
  request: Request,
  targetUrl: string,
  path: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const url = new URL(path, targetUrl);
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers(request.headers);

  // Clean up headers for target
  headers.delete('host');

  // Handle cache
  let cacheKey = '';
  if (options.useCache && options.kv && request.method === 'GET') {
    cacheKey = `cache:${path}:${url.search}`.replace(/[^a-zA-Z0-9:_-]/g, '_').substring(0, 512);
    const cached = await options.kv.get(cacheKey, { type: 'json' });
    if (cached) {
      return new Response(JSON.stringify(cached.body), {
        headers: {
          'Content-Type': cached.contentType || 'application/json',
          'X-Cache': 'HIT',
          ...getCorsHeaders(origin),
        },
      });
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      ...(request.method !== 'GET' && request.method !== 'HEAD' ? { duplex: 'half' } : {})
    });

    const contentType = response.headers.get('Content-Type') || '';
    const newHeaders = new Headers(response.headers);
    Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => newHeaders.set(k, v));
    newHeaders.set('X-Cache', 'MISS');

    // Handle SSE
    if (contentType.includes('text/event-stream')) {
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    // Handle Caching
    if (options.useCache && options.kv && response.ok && request.method === 'GET') {
      const body = await response.text();
      options.ctx?.waitUntil(options.kv.put(cacheKey, JSON.stringify({
        body,
        contentType,
        cachedAt: new Date().toISOString()
      }), {
        expirationTtl: options.cacheTTL
      }));

      return new Response(body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Service unavailable', message: (error as Error).message }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
    });
  }
}
