// Cloudflare Worker for API Proxying and Edge Computing
// This worker handles API requests, implements caching, security, and load balancing

// Configuration
const CONFIG = {
  // Origin servers (NAS endpoints)
  origins: [
    {
      name: 'primary',
      url: 'https://nexus-reader.yourdomain.com',
      weight: 100,
      healthCheck: '/health',
      timeout: 30000
    }
  ],
  
  // Cache settings for different API endpoints
  cacheSettings: {
    '/api/novels': { ttl: 300, staleWhileRevalidate: 600 },
    '/api/novels/popular': { ttl: 600, staleWhileRevalidate: 1200 },
    '/api/user/preferences': { ttl: 60, staleWhileRevalidate: 120 },
    '/api/reading/progress': { ttl: 30, staleWhileRevalidate: 60 },
    '/api/search': { ttl: 180, staleWhileRevalidate: 360 },
    '/api/semantic-search': { ttl: 300, staleWhileRevalidate: 600 },
    '/api/index-novel': { ttl: 0, staleWhileRevalidate: 0 }, // No cache for indexing
    '/api/index-chapter': { ttl: 0, staleWhileRevalidate: 0 }, // No cache for indexing
    '/health': { ttl: 30, staleWhileRevalidate: 60 }
  },
  
  // Rate limiting
  rateLimits: {
    '/api/auth': { requests: 10, window: 60 }, // 10 requests per minute
    '/api/sync': { requests: 100, window: 60 }, // 100 requests per minute
    '/api/novels': { requests: 200, window: 60 }, // 200 requests per minute
    '/api/semantic-search': { requests: 50, window: 60 }, // 50 requests per minute for AI search
    '/api/index-novel': { requests: 20, window: 60 }, // 20 indexing requests per minute
    '/api/index-chapter': { requests: 100, window: 60 }, // 100 chapter indexing per minute
    'default': { requests: 500, window: 60 } // 500 requests per minute default
  },
  
  // Security settings
  security: {
    allowedOrigins: [
      'https://nexus-reader.yourdomain.com',
      'https://cf-bypass.yourdomain.com'
    ],
    blockedUserAgents: [
      'bot',
      'crawler',
      'spider',
      'scraper'
    ],
    maxRequestSize: 10 * 1024 * 1024, // 10MB
    requireAuth: [
      '/api/user',
      '/api/sync',
      '/api/reading'
    ]
  }
};

// Main request handler
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Security checks
    const securityCheck = await performSecurityChecks(request);
    if (!securityCheck.allowed) {
      return new Response(securityCheck.reason, { 
        status: securityCheck.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Rate limiting
    const rateLimitCheck = await checkRateLimit(request, path);
    if (!rateLimitCheck.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitCheck.retryAfter
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': rateLimitCheck.retryAfter.toString()
        }
      });
    }
    
    // Handle different request types
    if (path.startsWith('/api/')) {
      return handleAPIRequest(request, path);
    } else if (path === '/health') {
      return handleHealthCheck(request);
    } else if (path.startsWith('/ws/')) {
      return handleWebSocketUpgrade(request);
    } else {
      // Proxy to origin for non-API requests
      return proxyToOrigin(request);
    }
    
  } catch (error) {
    console.error('Worker error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Security checks
async function performSecurityChecks(request) {
  const userAgent = request.headers.get('User-Agent') || '';
  const origin = request.headers.get('Origin');
  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  
  // Check for blocked user agents
  for (const blockedAgent of CONFIG.security.blockedUserAgents) {
    if (userAgent.toLowerCase().includes(blockedAgent)) {
      return {
        allowed: false,
        status: 403,
        reason: JSON.stringify({ error: 'Forbidden', message: 'Blocked user agent' })
      };
    }
  }
  
  // Check origin for CORS requests
  if (origin && !CONFIG.security.allowedOrigins.includes(origin)) {
    return {
      allowed: false,
      status: 403,
      reason: JSON.stringify({ error: 'Forbidden', message: 'Origin not allowed' })
    };
  }
  
  // Check request size
  if (contentLength > CONFIG.security.maxRequestSize) {
    return {
      allowed: false,
      status: 413,
      reason: JSON.stringify({ error: 'Payload too large', message: 'Request exceeds size limit' })
    };
  }
  
  return { allowed: true };
}

// Rate limiting using Cloudflare KV
async function checkRateLimit(request, path) {
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `rate_limit:${clientIP}:${path}`;
  
  // Get rate limit config for this path
  const rateLimitConfig = CONFIG.rateLimits[path] || CONFIG.rateLimits.default;
  
  try {
    // Get current count from KV
    const currentCount = await RATE_LIMIT_KV.get(rateLimitKey);
    const count = currentCount ? parseInt(currentCount) : 0;
    
    if (count >= rateLimitConfig.requests) {
      return {
        allowed: false,
        retryAfter: rateLimitConfig.window
      };
    }
    
    // Increment counter
    await RATE_LIMIT_KV.put(rateLimitKey, (count + 1).toString(), {
      expirationTtl: rateLimitConfig.window
    });
    
    return { allowed: true };
    
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow request if rate limiting fails
    return { allowed: true };
  }
}

// Handle API requests with caching
async function handleAPIRequest(request, path) {
  // Route semantic search requests to dedicated worker
  if (path.startsWith('/api/semantic-search') || 
      path.startsWith('/api/index-novel') || 
      path.startsWith('/api/index-chapter')) {
    return handleSemanticSearchRequest(request, path);
  }
  
  const cacheKey = new Request(request.url, request);
  const cache = caches.default;
  
  // Check cache first for GET requests
  if (request.method === 'GET') {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // Add cache hit header
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set('X-Cache', 'HIT');
      response.headers.set('X-Cache-Age', Math.floor((Date.now() - new Date(cachedResponse.headers.get('Date')).getTime()) / 1000).toString());
      return response;
    }
  }
  
  // Forward to origin
  const originResponse = await proxyToOrigin(request);
  
  // Cache successful GET responses
  if (request.method === 'GET' && originResponse.ok) {
    const cacheConfig = getCacheConfig(path);
    if (cacheConfig) {
      const responseToCache = originResponse.clone();
      responseToCache.headers.set('Cache-Control', `public, max-age=${cacheConfig.ttl}, stale-while-revalidate=${cacheConfig.staleWhileRevalidate}`);
      responseToCache.headers.set('X-Cache', 'MISS');
      
      // Store in cache
      await cache.put(cacheKey, responseToCache);
    }
  }
  
  return originResponse;
}

// Handle semantic search requests by routing to dedicated worker
async function handleSemanticSearchRequest(request, path) {
  try {
    // Route to semantic search worker
    const semanticSearchUrl = new URL(request.url);
    semanticSearchUrl.hostname = 'search.your-domain.com'; // Replace with actual semantic search worker domain
    
    const semanticRequest = new Request(semanticSearchUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    // Add routing headers
    semanticRequest.headers.set('X-Forwarded-From', 'api-proxy');
    semanticRequest.headers.set('X-Original-Path', path);
    
    const response = await fetch(semanticRequest);
    
    // Add CORS headers
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return modifiedResponse;
    
  } catch (error) {
    console.error('Semantic search routing error:', error);
    return new Response(JSON.stringify({
      error: 'Semantic search service unavailable',
      message: error.message
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Get cache configuration for path
function getCacheConfig(path) {
  // Find matching cache config
  for (const [pattern, config] of Object.entries(CONFIG.cacheSettings)) {
    if (path.startsWith(pattern)) {
      return config;
    }
  }
  return null;
}

// Health check handler
async function handleHealthCheck(request) {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    worker: {
      version: '1.0.0',
      region: request.cf?.colo || 'unknown',
      datacenter: request.cf?.datacenter || 'unknown'
    },
    origins: []
  };
  
  // Check origin health
  for (const origin of CONFIG.origins) {
    try {
      const healthCheckUrl = `${origin.url}${origin.healthCheck}`;
      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        timeout: 5000
      });
      
      healthData.origins.push({
        name: origin.name,
        url: origin.url,
        status: response.ok ? 'healthy' : 'unhealthy',
        responseTime: response.headers.get('X-Response-Time') || 'unknown'
      });
    } catch (error) {
      healthData.origins.push({
        name: origin.name,
        url: origin.url,
        status: 'error',
        error: error.message
      });
    }
  }
  
  // Determine overall health
  const unhealthyOrigins = healthData.origins.filter(o => o.status !== 'healthy');
  if (unhealthyOrigins.length === healthData.origins.length) {
    healthData.status = 'unhealthy';
  } else if (unhealthyOrigins.length > 0) {
    healthData.status = 'degraded';
  }
  
  const statusCode = healthData.status === 'healthy' ? 200 : 503;
  
  return new Response(JSON.stringify(healthData, null, 2), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}

// WebSocket upgrade handler
async function handleWebSocketUpgrade(request) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 400 });
  }
  
  // Proxy WebSocket connection to origin
  return proxyToOrigin(request);
}

// Proxy request to origin server
async function proxyToOrigin(request) {
  // Select origin (simple round-robin for now)
  const origin = CONFIG.origins[0]; // Use primary origin
  
  // Create new request with origin URL
  const url = new URL(request.url);
  const originUrl = new URL(origin.url);
  url.hostname = originUrl.hostname;
  url.port = originUrl.port;
  url.protocol = originUrl.protocol;
  
  // Create modified request
  const modifiedRequest = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  
  // Add forwarding headers
  modifiedRequest.headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || 'unknown');
  modifiedRequest.headers.set('X-Forwarded-Proto', 'https');
  modifiedRequest.headers.set('X-Forwarded-Host', request.headers.get('Host') || 'unknown');
  
  try {
    const response = await fetch(modifiedRequest, {
      timeout: origin.timeout
    });
    
    // Add CORS headers if needed
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return modifiedResponse;
    
  } catch (error) {
    console.error('Origin request failed:', error);
    return new Response(JSON.stringify({
      error: 'Service unavailable',
      message: 'Origin server is not responding'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle OPTIONS requests for CORS
addEventListener('fetch', event => {
  if (event.request.method === 'OPTIONS') {
    event.respondWith(handleCORS(event.request));
  }
});

function handleCORS(request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}