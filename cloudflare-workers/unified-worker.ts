/**
 * Unified Cloudflare Worker (Omni-Worker)
 * 整合了身份验证、代理转发、章节解密、进度同步等所有核心功能
 * 基于 TypeScript 并集成了性能优化、自动调优和自我修复系统
 */

import { verifyAuth, generateToken, type TokenPayload } from './shared/auth.ts';
import { createLogger } from './shared/logger.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from './shared/cors.ts';
import { proxyRequest } from './shared/proxy.ts';
import { getPerformanceMonitor } from './shared/performance-monitor.ts';
import { getAutoTuner, startAutoTuning } from './shared/auto-tuner.ts';
import { getSelfHealingSystem, startSelfHealing } from './shared/self-healing.ts';
import { DecoderEngine } from './decoder/decoder-engine.ts';
import {
  type DecodeRequest,
  type WorkerEnv,
  type Progress
} from './shared/types.ts';

// 常量配置
const OAUTH_STATE_TTL = 600; // 10 分钟
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天

// ============================================
// Auth Handlers (GitHub OAuth)
// ============================================

async function handleGitHubLogin(env: WorkerEnv): Promise<Response> {
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

async function handleGitHubCallback(request: Request, env: WorkerEnv): Promise<Response> {
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

    const tokenData = await tokenRes.json() as any;
    if (tokenData.error) return Response.redirect(`${env.FRONTEND_URL}?error=${tokenData.error}`, 302);

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Nexus-Reader-Unified'
      },
    });

    const user = await userRes.json() as any;
    // 权限检查：仅允许指定的 GitHub Owner 访问
    if (user.login.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) {
      logger.warn(`Unauthorized login attempt by ${user.login}`);
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302);
    }

    const payload: TokenPayload = {
      provider: 'github',
      id: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
      exp: Date.now() + COOKIE_MAX_AGE * 1000
    };

    const token = await generateToken(payload, env.AUTH_SECRET);

    // 重定向回前端并携带 token
    const redirectUrl = new URL(env.FRONTEND_URL);
    redirectUrl.searchParams.set('token', token);
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (e) {
    logger.error('GitHub OAuth error:', e);
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302);
  }
}

async function handleVerify(request: Request, env: WorkerEnv): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const corsHeaders = getCorsHeaders(origin);
  const user = await verifyAuth(request, env);

  if (user) {
    return new Response(JSON.stringify({ authenticated: true, user }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } else {
    return new Response(JSON.stringify({ authenticated: false }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// ============================================
// Progress Sync Handlers
// ============================================

async function handleProgress(request: Request, env: WorkerEnv, bookId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const corsHeaders = getCorsHeaders(origin);
  const KV = env.PROGRESS_KV;

  if (!KV) {
    return new Response(JSON.stringify({ error: 'Progress KV not configured' }), {
      status: 500, headers: corsHeaders
    });
  }

  if (request.method === 'GET') {
    const data = await KV.get(`progress:${bookId}`, 'json');
    if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  }

  if (request.method === 'PUT') {
    const body = await request.json() as any;
    const progress: Progress = {
      bookId,
      chapterIndex: body.chapterIndex ?? 0,
      scrollPercent: body.scrollPercent ?? 0,
      updatedAt: Date.now()
    };
    await KV.put(`progress:${bookId}`, JSON.stringify(progress), { metadata: progress });
    return new Response(JSON.stringify(progress), { headers: corsHeaders });
  }

  if (request.method === 'DELETE') {
    await KV.delete(`progress:${bookId}`);
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
}

// ============================================
// Decoder Handlers (Optimized)
// ============================================

async function handleDecode(request: Request, env: WorkerEnv): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const corsHeaders = getCorsHeaders(origin);
  const logger = createLogger(env);
  const startTime = Date.now();

  try {
    const body = await request.json() as DecodeRequest;

    if (!body.bookId || !body.chapterId || !body.content) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const decoder = new DecoderEngine(env);
    const result = await decoder.decode(body);

    const processingTime = Date.now() - startTime;
    logger.info(`Decode completed in ${processingTime}ms for chapter ${body.chapterId}`);

    const response = {
      ...result,
      _meta: {
        processingTime,
        entitiesFound: result.entities.length,
        cached: result.cached
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    const processingTime = Date.now() - startTime;
    logger.error(`Decode error:`, e);
    return new Response(JSON.stringify({ error: 'Internal server error', processingTime }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

// ============================================
// Worker 入口与初始化
// ============================================

let isInitialized = false;

function initializeAutoSystems(env: WorkerEnv): void {
  if (isInitialized) return;
  try {
    if (env.AUTO_TUNING_ENABLED !== false as any) {
      startAutoTuning({
        tuningInterval: (env as any).AUTO_TUNING_INTERVAL || 300000,
        performanceThresholds: {
          targetResponseTime: 500,
          targetCacheHitRate: 0.8,
          targetErrorRate: 0.02,
          maxCpuUsage: 0.7,
          maxMemoryUsage: 0.8
        }
      });
    }
    startSelfHealing();
    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize auto systems:', error);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    initializeAutoSystems(env);
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);

    // 1. 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest(request);
    }

    // 2. 公共路由 (无需认证)
    if (path === '/health') {
      const healthData = {
        status: 'ok',
        service: 'nexus-unified-worker',
        timestamp: new Date().toISOString(),
      };
      // 尝试转发到 backend health 检查
      try {
        return await proxyRequest(request, env.NEXUS_LITE_URL, '/api/health', { useCache: false });
      } catch (e) {
        return new Response(JSON.stringify(healthData), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (path === '/login/github') return handleGitHubLogin(env);
    if (path === '/callback/github') return handleGitHubCallback(request, env);
    if (path === '/verify') return handleVerify(request, env);
    if (path === '/logout') {
      // 清除 cookie (如果使用了 cookie)
      const headers = new Headers(corsHeaders);
      headers.append('Set-Cookie', 'nexus_auth=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0');
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // 3. 认证注入
    const user = await verifyAuth(request, env);
    if (!user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Please login first',
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 4. 路由分发

    // --- 进度同步 ---
    const progressMatch = path.match(/^\/progress\/(.+)$/);
    if (progressMatch) return handleProgress(request, env, progressMatch[1]);
    if (path === '/progress' && request.method === 'GET') {
      // List all progress logic (could be added here)
      return new Response(JSON.stringify([]), { headers: corsHeaders });
    }

    // --- 章节解密 ---
    if (path === '/decode' && request.method === 'POST') {
      return handleDecode(request, env);
    }

    // --- 性能监控与调优 (仅管理员) ---
    const isAdmin = user.id === (env as any).ADMIN_USER_ID;
    if (isAdmin) {
      if (path === '/metrics') {
        const monitor = getPerformanceMonitor();
        const range = parseInt(url.searchParams.get('range') || '300000');
        return new Response(JSON.stringify(monitor.getAggregatedMetrics(range)), { headers: corsHeaders });
      }
      if (path === '/tune') {
        return new Response(JSON.stringify(getAutoTuner().getTuningStatus()), { headers: corsHeaders });
      }
    }

    // --- 代理转发 (默认行为) ---
    // 自动补全 /api 前缀，如果缺失
    const apiPath = path.startsWith('/api/') ? path : `/api${path}`;

    // 特定路由的缓存配置
    let useCache = false;
    let cacheTTL = 0;

    if (path.startsWith('/content')) { useCache = true; cacheTTL = 3600; }
    if (path.startsWith('/toc')) { useCache = true; cacheTTL = 1800; }
    if (path.startsWith('/search')) { useCache = true; cacheTTL = 600; }

    if (path.startsWith('/cf-bypass')) {
      const cfPath = path.replace('/cf-bypass', '') || '/';
      return proxyRequest(request, env.CF_BYPASS_URL, cfPath + url.search, { useCache: false });
    }

    return proxyRequest(request, env.NEXUS_LITE_URL, apiPath + url.search, {
      useCache,
      cacheTTL,
      kv: env.CONTENT_CACHE_KV,
      ctx
    });
  },

  async scheduled(_event: any, env: WorkerEnv, ctx: ExecutionContext) {
    // 定期保活
    ctx.waitUntil(fetch(`${env.NEXUS_LITE_URL}/api/health`));
    ctx.waitUntil(fetch(`${env.CF_BYPASS_URL}/health`));
  },
};
