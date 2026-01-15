/**
 * Cloudflare Worker for Reading Progress Sync
 * Uses KV to store reading progress across devices
 * 
 * 认证保护 - 只允许已登录用户访问
 */

// 导入共享认证模块
import { verifyAuth } from './shared/auth.ts';

const ALLOWED_ORIGINS = [
  'https://nexus-reader.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';

    // CORS headers - 限制来源
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check - 公开
    if (path === '/health') {
      return Response.json({ status: 'ok', service: 'progress-sync' }, { headers: corsHeaders });
    }

    // ========== 以下端点需要认证 ==========
    const user = await verifyAuth(request, env);
    if (!user) {
      return Response.json({ 
        error: 'Unauthorized',
        message: 'Please login first'
      }, { status: 401, headers: corsHeaders });
    }

    // Route: /progress/:bookId
    const progressMatch = path.match(/^\/progress\/(.+)$/);
    if (progressMatch) {
      const bookId = progressMatch[1];
      return handleProgress(request, env, bookId, corsHeaders);
    }

    // Route: /progress (list all)
    if (path === '/progress' && request.method === 'GET') {
      return handleListProgress(env, corsHeaders);
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }
};

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
        
        await KV.put(`progress:${bookId}`, JSON.stringify(progress));
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
  const list = await KV.list({ prefix: 'progress:' });
  
  const results = await Promise.all(
    list.keys.map(async (key) => {
      const data = await KV.get(key.name, 'json');
      return data;
    })
  );

  return Response.json(results.filter(Boolean), { headers: corsHeaders });
}
