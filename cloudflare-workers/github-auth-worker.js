/**
 * GitHub OAuth Worker
 * 处理 GitHub 第三方登录认证
 */

const COOKIE_NAME = 'nexus_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 路由
    switch (path) {
      case '/login':
        return handleLogin(env);
      case '/callback':
        return handleCallback(request, env);
      case '/verify':
        return handleVerify(request, env, corsHeaders);
      case '/logout':
        return handleLogout(corsHeaders);
      case '/health':
        return Response.json({ status: 'ok', service: 'github-auth' }, { headers: corsHeaders });
      default:
        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    }
  }
};

// 跳转到 GitHub 授权页
function handleLogin(env) {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/callback`,
    scope: 'read:user',
    state: crypto.randomUUID(),
  });

  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
}

// GitHub 回调处理
async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return Response.redirect(`${env.FRONTEND_URL}?error=no_code`, 302);
  }

  try {
    // 用 code 换 access_token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
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

    // 获取用户信息
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Nexus-Reader-Auth',
      },
    });

    const user = await userRes.json();

    // 检查是否是允许的用户
    const allowedUsers = (env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase());
    if (allowedUsers.length > 0 && allowedUsers[0] !== '' && !allowedUsers.includes(user.login.toLowerCase())) {
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302);
    }

    // 生成会话 token
    const sessionToken = await generateSessionToken(user, env);

    // 设置 cookie 并跳转回前端
    const response = Response.redirect(env.FRONTEND_URL, 302);
    const headers = new Headers(response.headers);
    headers.set('Set-Cookie', `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`);
    
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error('OAuth error:', error);
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302);
  }
}

// 验证会话
async function handleVerify(request, env, corsHeaders) {
  const cookie = request.headers.get('Cookie') || '';
  const token = getCookie(cookie, COOKIE_NAME);

  if (!token) {
    return Response.json({ authenticated: false }, { headers: corsHeaders });
  }

  try {
    const payload = await verifySessionToken(token, env);
    if (payload) {
      return Response.json({
        authenticated: true,
        user: {
          login: payload.login,
          avatar: payload.avatar,
        },
      }, { headers: corsHeaders });
    }
  } catch (e) {
    // Token invalid
  }

  return Response.json({ authenticated: false }, { headers: corsHeaders });
}

// 登出
function handleLogout(corsHeaders) {
  const headers = new Headers(corsHeaders);
  headers.set('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(JSON.stringify({ success: true }), { headers });
}

// 生成会话 token (简单的 JWT-like)
async function generateSessionToken(user, env) {
  const payload = {
    login: user.login,
    avatar: user.avatar_url,
    exp: Date.now() + COOKIE_MAX_AGE * 1000,
  };
  
  const data = btoa(JSON.stringify(payload));
  const signature = await sign(data, env.AUTH_SECRET);
  return `${data}.${signature}`;
}

// 验证会话 token
async function verifySessionToken(token, env) {
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;

  const expectedSig = await sign(data, env.AUTH_SECRET);
  if (signature !== expectedSig) return null;

  const payload = JSON.parse(atob(data));
  if (payload.exp < Date.now()) return null;

  return payload;
}

// 签名
async function sign(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// 解析 cookie
function getCookie(cookieString, name) {
  const match = cookieString.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}
