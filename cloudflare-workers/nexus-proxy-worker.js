/**
 * Nexus Proxy Worker
 * 
 * 功能：
 * 1. 代理请求到 HuggingFace Spaces (nexus-lite + cf-bypass)
 * 2. 保活机制 - 防止 HF Space 休眠
 * 3. 响应缓存 - 减少 HF 请求
 * 4. CORS 处理
 * 5. 健康检查和状态监控
 */

// 配置 (通过环境变量设置)
const CONFIG = {
  // HuggingFace Space URLs (从环境变量读取)
  NEXUS_LITE_URL: '', // 运行时从 env 读取
  CF_BYPASS_URL: '',  // 运行时从 env 读取
  
  // 缓存配置
  CACHE_TTL: 300,           // 5分钟缓存
  SEARCH_CACHE_TTL: 60,     // 搜索结果1分钟缓存
  
  // 保活配置
  KEEPALIVE_INTERVAL: 25 * 60 * 1000, // 25分钟
  
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
    'Access-Control-Max-Age': '86400',
  };
}

// 处理 OPTIONS 预检请求
function handleOptions(request) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

// 代理请求到 HuggingFace
async function proxyToHF(request, env, targetUrl, path) {
  const url = new URL(path, targetUrl);
  
  // 复制请求
  const proxyRequest = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
  });
  
  // 移除 host 头，让 fetch 自动设置
  const headers = new Headers(proxyRequest.headers);
  headers.delete('host');
  
  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().text() : null,
    });
    
    // 添加 CORS 头
    const origin = request.headers.get('Origin') || '';
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    
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
        ...corsHeaders(request.headers.get('Origin') || ''),
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
    
    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    
    // 获取 HF URLs (必须通过环境变量配置)
    const nexusUrl = env.NEXUS_LITE_URL;
    const cfBypassUrl = env.CF_BYPASS_URL;
    
    if (!nexusUrl || !cfBypassUrl) {
      return new Response(JSON.stringify({ 
        error: 'Service URLs not configured. Deploy the proxy worker with NEXUS_LITE_URL and CF_BYPASS_URL.'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders(origin)
        },
      });
    }
    
    // 路由
    switch (true) {
      // 健康检查
      case path === '/health':
        return handleHealth(env);
      
      // 保活端点
      case path === '/keepalive':
        return keepAlive(env);
      
      // CF Bypass 代理 (/cf-bypass/*)
      case path.startsWith('/cf-bypass'):
        const cfPath = path.replace('/cf-bypass', '') || '/';
        return proxyToHF(request, env, cfBypassUrl, cfPath + url.search);
      
      // Nexus-lite API 代理 (默认)
      default:
        return proxyToHF(request, env, nexusUrl, path + url.search);
    }
  },
  
  // 定时任务 - 保活
  async scheduled(event, env, ctx) {
    console.log('Running scheduled keepalive...');
    ctx.waitUntil(keepAlive(env));
  },
};
