/**
 * Unified Cloudflare Worker (Refactored)
 * Consolidates nexus-proxy, github-auth, and progress-sync workers
 */

import { verifyAuth } from './shared/auth.ts';
import { createLogger } from './shared/logger.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from './shared/cors.ts';
import { proxyRequest } from './shared/proxy.ts';
import { CACHE_TTL } from './shared/cache.ts';

// Constants
const COOKIE_NAME = 'nexus_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const OAUTH_STATE_TTL = 600; // 10 minutes

// ==================== OAuth Handlers ====================

async function handleGitHubLogin(env) {
  const state = crypto.randomUUID();
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

  if (!code || !state) {
    return Response.redirect(`${env.FRONTEND_URL}?error=invalid_request`, 302);
  }

  if (env.PROGRESS_KV) {
    const storedState = await env.PROGRESS_KV.get(`oauth_state:${state}`);
    if (!storedState) {
      logger.warn('OAuth state validation failed');
      return Response.redirect(`${env.FRONTEND_URL}?error=invalid_state`, 302);
    }
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
    if (tokenData.error) return Response.redirect(`${env.FRONTEND_URL}?error=${tokenData.error}`, 302);

    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'User-Agent': 'Nexus-Auth' },
    });

    const user = await userRes.json();
    if (user.login.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) {
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302);
    }

    const payload = { provider: 'github', id: user.login, name: user.login, avatar: user.avatar_url, exp: Date.now() + COOKIE_MAX_AGE * 1000 };
    const token = await signPayload(payload, env.AUTH_SECRET);
    
    const redirectUrl = new URL(env.FRONTEND_URL);
    redirectUrl.searchParams.set('token', token);
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (e) {
    logger.error('GitHub OAuth error:', e);
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302);
  }
}

async function signPayload(payload, secret) {
  const data = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

// ==================== Progress Sync Handlers ====================

async function handleProgress(request, env, bookId, corsHeaders) {
  const KV = env.PROGRESS_KV;
  if (!KV) return Response.json({ error: 'KV not configured' }, { status: 500, headers: corsHeaders });

  if (request.method === 'GET') {
    const data = await KV.get(`progress:${bookId}`, 'json');
    return data ? Response.json(data, { headers: corsHeaders }) : Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }

  if (request.method === 'PUT') {
    const body = await request.json();
    const progress = { bookId, chapterIndex: body.chapterIndex ?? 0, scrollPercent: body.scrollPercent ?? 0, updatedAt: Date.now() };
    await KV.put(`progress:${bookId}`, JSON.stringify(progress), { metadata: progress });
    return Response.json(progress, { headers: corsHeaders });
  }

  if (request.method === 'DELETE') {
    await KV.delete(`progress:${bookId}`);
    return Response.json({ success: true }, { headers: corsHeaders });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
}

async function handleListProgress(env, corsHeaders) {
  const KV = env.PROGRESS_KV;
  if (!KV) return Response.json({ error: 'KV not configured' }, { status: 500, headers: corsHeaders });
  
  const results = [];
  let cursor = undefined;
  do {
    const listResult = await KV.list({ prefix: 'progress:', cursor, include: ['metadata'] });
    listResult.keys.forEach(k => k.metadata && results.push(k.metadata));
    cursor = listResult.list_complete ? undefined : listResult.cursor;
  } while (cursor);
  
  return Response.json(results, { headers: corsHeaders });
}

// ==================== Main Export ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);
    
    if (request.method === 'OPTIONS') return handleCorsPreflightRequest(request);
    
    // Public routes
    if (path === '/health') return proxyRequest(request, env.NEXUS_LITE_URL, '/api/health', { useCache: false });
    if (path === '/login/github') return handleGitHubLogin(env);
    if (path === '/callback/github') return handleGitHubCallback(request, env);
    if (path === '/logout') {
      const headers = new Headers(corsHeaders);
      headers.set('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`);
      return Response.json({ success: true }, { headers });
    }

    // Protected routes
    const user = await verifyAuth(request, env);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    // Progress routes
    const progressMatch = path.match(/^\/progress\/(.+)$/);
    if (progressMatch) return handleProgress(request, env, progressMatch[1], corsHeaders);
    if (path === '/progress' && request.method === 'GET') return handleListProgress(env, corsHeaders);

    // Business routes (Proxying)
    const apiPath = path.startsWith('/api/') ? path : `/api${path}`;
    
    if (path.startsWith('/content')) return proxyRequest(request, env.NEXUS_LITE_URL, apiPath + url.search, { useCache: true, cacheTTL: CACHE_TTL.CONTENT, kv: env.CONTENT_CACHE_KV, ctx });
    if (path.startsWith('/toc')) return proxyRequest(request, env.NEXUS_LITE_URL, apiPath + url.search, { useCache: true, cacheTTL: CACHE_TTL.TOC, kv: env.CONTENT_CACHE_KV, ctx });
    if (path.startsWith('/search')) return proxyRequest(request, env.NEXUS_LITE_URL, apiPath + url.search, { useCache: true, cacheTTL: CACHE_TTL.SEARCH, kv: env.CONTENT_CACHE_KV, ctx });
    
    if (path.startsWith('/cf-bypass')) {
      const cfPath = path.replace('/cf-bypass', '') || '/';
      return proxyRequest(request, env.CF_BYPASS_URL, cfPath + url.search, { useCache: false });
    }

    return proxyRequest(request, env.NEXUS_LITE_URL, apiPath + url.search, { useCache: false });
  },

  async scheduled(_event, env, ctx) {
    const logger = createLogger(env);
    logger.info('Running scheduled keepalive...');
    // Simplified keepalive
    ctx.waitUntil(fetch(`${env.NEXUS_LITE_URL}/api/health`));
    ctx.waitUntil(fetch(`${env.CF_BYPASS_URL}/health`));
  },
};
