/**
 * Nexus Proxy Worker
 * 
 * 功能：
 * 1. 代理请求到 HuggingFace Spaces (nexus-lite + cf-bypass)
 * 2. 保活机制 - 防止 HF Space 休眠
 * 3. R2 缓存 - 章节内容缓存，加速阅读
 * 4. 认证保护 - 只允许已登录用户访问
 * 5. CORS 处理
 */

// 配置
const CONFIG = {
  // 缓存 TTL
  CONTENT_CACHE_TTL: 7 * 24 * 60 * 60,  // 章节内容缓存 7 天
  SEARCH_CACHE_TTL: 60 * 60,             // 搜索结果缓存 1 小时
  TOC_CACHE_TTL: 24 * 60 * 60,           // 目录缓存 1 天
  
  // 允许的源
  ALLOWED_ORIGINS: [
    'https://nexus-reader.pages.dev',
    'http://localhost:5173',
    'http://localhost:4173',
  ],
};

// CORS 头
function corsHeaders(origin) {
  const allowedOrigin = CONFIG.ALLOWED_ORIGINS.includes(origin) ? origin : CONFIG.ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// 验证认证 Token
async function verifyAuth(request, env) {
  // 从 Cookie 或 Header 获取 token
  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/nexus_auth=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!token) return null;
  
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    
    // 验证签名
    const key = await crypto.subtle.importKey(
      'raw', 
      new TextEncoder().encode(env.AUTH_SECRET), 
      { name: 'HMAC', hash: 'SHA-256' }, 
      false, 
      ['sign']
    );
    const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
    
    if (sig !== expectedSigB64) return null;
    
    const payload = JSON.parse(atob(data));
    if (payload.exp < Date.now()) return null;
    
    return payload;
  } catch (e) {
    return null;
  }
}

// 生成 R2 缓存 key
function getCacheKey(path, params) {
  const key = `cache:${path}:${JSON.stringify(params || {})}`;
  return key.replace(/[^a-zA-Z0-9:_-]/g, '_').substring(0, 512);
}

// 从 R2 获取缓存
async function getFromCache(env, key) {
  if (!env.CONTENT_CACHE) return null;
  
  try {
    const obj = await env.CONTENT_CACHE.get(key);
    if (!obj) return null;
    
    const metadata = obj.customMetadata || {};
    const expiry = parseInt(metadata.expiry || '0');
    
    if (expiry && Date.now() > expiry) {
      // 过期了，异步删除
      env.CONTENT_CACHE.delete(key);
      return null;
    }
    
    return {
      body: await obj.text(),
      contentType: metadata.contentType || 'application/json'
    };
  } catch (e) {
    console.error('R2 get error:', e);
    return null;
  }
}

// 存入 R2 缓存
async function saveToCache(env, key, body, contentType, ttlSeconds) {
  if (!env.CONTENT_CACHE) return;
  
  try {
    await env.CONTENT_CACHE.put(key, body, {
      customMetadata: {
        contentType,
        expiry: String(Date.now() + ttlSeconds * 1000),
        cachedAt: new Date().toISOString()
      }
    });
  } catch (e) {
    console.error('R2 put error:', e);
  }
}

// 处理 OPTIONS 预检请求
function handleOptions(request) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

// 代理请求到 HuggingFace (带 R2 缓存)
async function proxyToHF(request, env, targetUrl, path, useCache = false, cacheTTL = 0) {
  const url = new URL(path, targetUrl);
  const origin = request.headers.get('Origin') || '';
  
  // 尝试从 R2 缓存获取
  const cacheKey = getCacheKey(path, Object.fromEntries(url.searchParams));
  if (useCache && request.method === 'GET') {
    const cached = await getFromCache(env, cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: {
          'Content-Type': cached.contentType,
          'X-Cache': 'HIT',
          ...corsHeaders(origin),
        },
      });
    }
  }
  
  // 移除 host 头
  const headers = new Headers(request.headers);
  headers.delete('host');
  
  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().text() : null,
    });
    
    // 添加 CORS 头
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    newHeaders.set('X-Cache', 'MISS');
    
    // 成功响应且需要缓存
    if (useCache && response.ok && request.method === 'GET') {
      const body = await response.text();
      // 异步存入缓存
      env.ctx?.waitUntil(saveToCache(env, cacheKey, body, response.headers.get('Content-Type') || 'application/json', cacheTTL));
      
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
        ...corsHeaders(origin),
      },
    });
  }
}

// 健康检查端点
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
  
  // 检查 nexus-lite
  try {
    const nexusResp = await fetch(`${nexusUrl}/health`, { 
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
  
  // 检查 cf-bypass
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

// 保活 - 唤醒休眠的 HF Spaces
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
  
  // Ping nexus-lite
  try {
    await fetch(`${nexusUrl}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(60000) // 60秒超时，等待冷启动
    });
    results.push({ service: 'nexus-lite', status: 'awake' });
  } catch (e) {
    results.push({ service: 'nexus-lite', status: 'waking', error: e.message });
  }
  
  // Ping cf-bypass
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

// 主处理函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    
    // 保存 ctx 用于异步操作
    env.ctx = ctx;
    
    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    
    // 获取 HF URLs
    const nexusUrl = env.NEXUS_LITE_URL;
    const cfBypassUrl = env.CF_BYPASS_URL;
    
    if (!nexusUrl || !cfBypassUrl) {
      return new Response(JSON.stringify({ 
        error: 'Service URLs not configured'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
    
    // 公开端点（不需要认证）
    if (path === '/health') {
      return handleHealth(env);
    }
    if (path === '/keepalive') {
      return keepAlive(env);
    }
    
    // ========== 以下端点需要认证 ==========
    const user = await verifyAuth(request, env);
    if (!user) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized',
        message: 'Please login first'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
    
    // 路由（带缓存策略）
    switch (true) {
      // 章节内容 - 长期缓存
      case path === '/content' || path.startsWith('/content/'):
        return proxyToHF(request, env, nexusUrl, path + url.search, true, CONFIG.CONTENT_CACHE_TTL);
      
      // 目录 - 中期缓存
      case path === '/toc' || path.startsWith('/toc/'):
        return proxyToHF(request, env, nexusUrl, path + url.search, true, CONFIG.TOC_CACHE_TTL);
      
      // 搜索 - 短期缓存
      case path === '/search':
        return proxyToHF(request, env, nexusUrl, path + url.search, true, CONFIG.SEARCH_CACHE_TTL);
      
      // CF Bypass 代理
      case path.startsWith('/cf-bypass'):
        const cfPath = path.replace('/cf-bypass', '') || '/';
        return proxyToHF(request, env, cfBypassUrl, cfPath + url.search, false, 0);
      
      // 其他 API - 不缓存
      default:
        return proxyToHF(request, env, nexusUrl, path + url.search, false, 0);
    }
  },
  
  // 定时任务 - 保活
  async scheduled(event, env, ctx) {
    console.log('Running scheduled keepalive...');
    ctx.waitUntil(keepAlive(env));
  },
};
