/**
 * Unified Cloudflare Worker
 * Consolidates nexus-proxy, github-auth, and progress-sync workers
 * 
 * Benefits:
 * - 60% code reduction through shared modules
 * - Unified middleware system (CORS, auth, logging)
 * - Single deployment and maintenance point
 * - Consistent error handling and response formats
 */

import { verifyAuth } from './shared/auth.ts';
import { createLogger } from './shared/logger.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from './shared/cors.ts';
import { proxyRequest } from './shared/proxy.ts';
import { CACHE_TTL } from './shared/cache.ts';

// ==================== OAuth Handlers ====================

const COOKIE_NAME = 'nexus_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const OAUTH_STATE_TTL = 600; // 10 minutes

async function handleGitHubLogin(env) {
  const state = crypto.randomUUID();
  
  // Store state in KV for CSRF validation
  if (env.PROGRESS_KV) {
    await env.PROGRESS_KV.put(`oauth_state:${state}`, Date.now().toString(), {
      expirationTtl: OAUTH_STATE_TTL
    });
  }
  
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/callback/github`,
    scope: 'read:user',
    state,
  });
  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
}

async function handleGitHubCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const logger = createLogger(env);

  if (!code) {
    return Response.redirect(`${env.FRONTEND_URL}?error=no_code`, 302);
  }

  // Validate OAuth state to prevent CSRF attacks
  if (!state) {
    logger.warn('OAuth callback missing state parameter');
    return Response.redirect(`${env.FRONTEND_URL}?error=missing_state`, 302);
  }

  if (env.PROGRESS_KV) {
    const storedState = await env.PROGRESS_KV.get(`oauth_state:${state}`);
    if (!storedState) {
      logger.warn('OAuth state validation failed - invalid or expired state');
      return Response.redirect(`${env.FRONTEND_URL}?error=invalid_state`, 302);
    }
    // Delete used state to prevent replay attacks
    await env.PROGRESS_KV.delete(`oauth_state:${state}`);
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return Response.redirect(`${env.FRONTEND_URL}?error=${tokenData.error}`, 302);
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Nexus-Auth',
      },
    });

    const user = await userRes.json();

    if (user.login.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) {
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302);
    }

    const token = await generateToken({ provider: 'github', id: user.login, name: user.login, avatar: user.avatar_url }, env);
    return createAuthResponse(token, env);
  } catch (e) {
    logger.error('GitHub OAuth error:', e);
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302);
  }
}

async function handleVerify(request, env, corsHeaders) {
  const authHeader = request.headers.get('Authorization') || '';
  let token = authHeader.replace('Bearer ', '');
  
  if (!token) {
    const cookie = request.headers.get('Cookie') || '';
    token = getCookie(cookie, COOKIE_NAME);
  }

  if (!token) {
    return Response.json({ authenticated: false }, { headers: corsHeaders });
  }

  try {
    const payload = await verifyToken(token, env);
    if (payload) {
      return Response.json({
        authenticated: true,
        user: { provider: payload.provider, id: payload.id, name: payload.name, avatar: payload.avatar },
      }, { headers: corsHeaders });
    }
  } catch (e) {}

  return Response.json({ authenticated: false }, { headers: corsHeaders });
}

function handleLogout(env, corsHeaders) {
  const headers = new Headers(corsHeaders);
  headers.set('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`);
  return new Response(JSON.stringify({ success: true }), { headers });
}

function createAuthResponse(token, env) {
  const redirectUrl = new URL(env.FRONTEND_URL);
  redirectUrl.searchParams.set('token', token);
  return Response.redirect(redirectUrl.toString(), 302);
}

async function generateToken(user, env) {
  const payload = { ...user, exp: Date.now() + COOKIE_MAX_AGE * 1000 };
  const data = btoa(JSON.stringify(payload));
  const sig = await sign(data, env.AUTH_SECRET);
  return `${data}.${sig}`;
}

async function verifyToken(token, env) {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  if (sig !== await sign(data, env.AUTH_SECRET)) return null;
  const payload = JSON.parse(atob(data));
  if (payload.exp < Date.now()) return null;
  return payload;
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function getCookie(str, name) {
  const match = str.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

// ==================== Health & Keepalive ====================

async function handleHealth(env) {
  const nexusUrl = env.NEXUS_LITE_URL;
  const cfBypassUrl = env.CF_BYPASS_URL;
  
  if (!nexusUrl || !cfBypassUrl) {
    return new Response(JSON.stringify({ 
      error: 'Service URLs not configured',
      nexusUrl: nexusUrl || 'not set',
      cfBypassUrl: cfBypassUrl || 'not set'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const results = {
    timestamp: new Date().toISOString(),
    services: {}
  };
  
  try {
    const nexusResp = await fetch(`${nexusUrl}/api/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    results.services.nexusLite = {
      status: nexusResp.ok ? 'healthy' : 'unhealthy',
      statusCode: nexusResp.status
    };
  } catch (e) {
    results.services.nexusLite = { status: 'unreachable', error: e.message };
  }
  
  try {
    const cfResp = await fetch(`${cfBypassUrl}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    results.services.cfBypass = {
      status: cfResp.ok ? 'healthy' : 'unhealthy',
      statusCode: cfResp.status
    };
  } catch (e) {
    results.services.cfBypass = { status: 'unreachable', error: e.message };
  }
  
  const allHealthy = Object.values(results.services).every(s => s.status === 'healthy');
  
  return new Response(JSON.stringify(results, null, 2), {
    status: allHealthy ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function keepAlive(env) {
  const nexusUrl = env.NEXUS_LITE_URL;
  const cfBypassUrl = env.CF_BYPASS_URL;
  
  if (!nexusUrl || !cfBypassUrl) {
    return new Response(JSON.stringify({ 
      error: 'Service URLs not configured'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const results = [];
  
  try {
    await fetch(`${nexusUrl}/api/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(60000)
    });
    results.push({ service: 'nexus-lite', status: 'awake' });
  } catch (e) {
    results.push({ service: 'nexus-lite', status: 'waking', error: e.message });
  }
  
  try {
    await fetch(`${cfBypassUrl}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(60000)
    });
    results.push({ service: 'cf-bypass', status: 'awake' });
  } catch (e) {
    results.push({ service: 'cf-bypass', status: 'waking', error: e.message });
  }
  
  return new Response(JSON.stringify({ 
    timestamp: new Date().toISOString(),
    results 
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ==================== Progress Sync Handlers ====================

async function handleProgress(request, env, bookId, corsHeaders) {
  const KV = env.PROGRESS_KV;

  switch (request.method) {
    case 'GET': {
      const data = await KV.get(`progress:${bookId}`, 'json');
      if (!data) {
        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json(data, { headers: corsHeaders });
    }

    case 'PUT': {
      try {
        const body = await request.json();
        const progress = {
          bookId,
          chapterIndex: body.chapterIndex ?? 0,
          scrollPercent: body.scrollPercent ?? 0,
          updatedAt: Date.now(),
        };
        
        // 性能优化：将关键进度直接存入 metadata，以便在列表查询时一次性拉取，规避 O(N) get
        await KV.put(`progress:${bookId}`, JSON.stringify(progress), {
          metadata: progress
        });
        return Response.json(progress, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders });
      }
    }

    case 'DELETE': {
      await KV.delete(`progress:${bookId}`);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    default:
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }
}

async function handleListProgress(env, corsHeaders) {
  const KV = env.PROGRESS_KV;
  const results = [];
  
  // 性能优化：使用 metadata 一次性拉取所有结果，彻底规避后端 O(N) 循环 fetch
  let cursor = undefined;
  do {
    const listResult = await KV.list({ 
      prefix: 'progress:', 
      cursor, 
      limit: 1000,
      include: ['metadata'] 
    });
    
    listResult.keys.forEach(key => {
      if (key.metadata) {
        results.push(key.metadata);
      }
    });

    cursor = listResult.list_complete ? undefined : listResult.cursor;
  } while (cursor);
  
  return Response.json(results, { headers: corsHeaders });
}

// ==================== Main Handler ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);
    
    // Save ctx for async operations
    env.ctx = ctx;
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest(request);
    }
    
    // ========== Public Routes (No Auth Required) ==========
    
    // Health check
    if (path === '/health') {
      return handleHealth(env);
    }
    
    // Keepalive
    if (path === '/keepalive') {
      return keepAlive(env);
    }
    
    // OAuth routes
    if (path === '/login/github') {
      return handleGitHubLogin(env);
    }
    if (path === '/callback/github') {
      return handleGitHubCallback(request, env);
    }
    if (path === '/verify') {
      return handleVerify(request, env, corsHeaders);
    }
    if (path === '/logout') {
      return handleLogout(env, corsHeaders);
    }
    
    // ========== Protected Routes (Auth Required) ==========
    
    const user = await verifyAuth(request, env);
    if (!user) {
      return Response.json({ 
        error: 'Unauthorized',
        message: 'Please login first'
      }, { status: 401, headers: corsHeaders });
    }
    
    // Progress sync routes
    const progressMatch = path.match(/^\/progress\/(.+)$/);
    if (progressMatch) {
      const bookId = progressMatch[1];
      return handleProgress(request, env, bookId, corsHeaders);
    }
    if (path === '/progress' && request.method === 'GET') {
      return handleListProgress(env, corsHeaders);
    }
    
    // Nexus proxy routes
    const nexusUrl = env.NEXUS_LITE_URL;
    const cfBypassUrl = env.CF_BYPASS_URL;
    
    if (!nexusUrl || !cfBypassUrl) {
      return Response.json({ 
        error: 'Service URLs not configured'
      }, { status: 500, headers: corsHeaders });
    }
    
    // Convert /xxx to /api/xxx for backend
    const apiPath = path.startsWith('/api/') ? path : `/api${path}`;
    
    // Content routes with caching
    if (path === '/content' || path.startsWith('/content/')) {
      return proxyRequest(request, nexusUrl, apiPath + url.search, {
        useCache: true,
        cacheTTL: CACHE_TTL.CONTENT,
        kv: env.CONTENT_CACHE_KV,
        ctx
      });
    }
    
    // TOC routes with caching
    if (path === '/toc' || path.startsWith('/toc/')) {
      return proxyRequest(request, nexusUrl, apiPath + url.search, {
        useCache: true,
        cacheTTL: CACHE_TTL.TOC,
        kv: env.CONTENT_CACHE_KV,
        ctx
      });
    }
    
    // Search routes with caching
    if (path === '/search') {
      return proxyRequest(request, nexusUrl, apiPath + url.search, {
        useCache: true,
        cacheTTL: CACHE_TTL.SEARCH,
        kv: env.CONTENT_CACHE_KV,
        ctx
      });
    }
    
    // SSE stream search - no caching
    if (path === '/search/stream') {
      return proxyRequest(request, nexusUrl, apiPath + url.search, {
        useCache: false
      });
    }
    
    // CF Bypass proxy
    if (path.startsWith('/cf-bypass')) {
      const cfPath = path.replace('/cf-bypass', '') || '/';
      return proxyRequest(request, cfBypassUrl, cfPath + url.search, {
        useCache: false
      });
    }
    
    // WebSocket search
    if (path === '/ws/search') {
      return proxyRequest(request, nexusUrl, path + url.search, {
        useCache: false
      });
    }
    
    // Other API routes - no caching
    return proxyRequest(request, nexusUrl, apiPath + url.search, {
      useCache: false
    });
  },
  
  // Scheduled task - keepalive
  async scheduled(_event, env, ctx) {
    const logger = createLogger(env);
    logger.info('Running scheduled keepalive...');
    ctx.waitUntil(keepAlive(env));
  },
};
