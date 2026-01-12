/**
 * Cloudflare Worker for API Proxying (Simplified)
 * Personal use - proxy to NAS with CORS support
 */

const ORIGIN_URL = 'https://nexus-reader.yourdomain.com';

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return Response.json({
        status: 'ok',
        worker: 'api-proxy',
        timestamp: new Date().toISOString()
      });
    }

    // Proxy all requests to origin
    return proxyToOrigin(request, url);
  }
};

function handleCORS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

async function proxyToOrigin(request, url) {
  // Build origin URL
  const originUrl = new URL(ORIGIN_URL);
  originUrl.pathname = url.pathname;
  originUrl.search = url.search;

  // Forward request
  const modifiedRequest = new Request(originUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body
  });

  // Add forwarding headers
  modifiedRequest.headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
  modifiedRequest.headers.set('X-Forwarded-Proto', 'https');

  try {
    const response = await fetch(modifiedRequest);

    // Add CORS headers to response
    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set('Access-Control-Allow-Origin', '*');

    return corsResponse;
  } catch (error) {
    return Response.json(
      { error: 'Origin unavailable', message: error.message },
      { status: 503 }
    );
  }
}