/**
 * OAuth Worker
 * 只允许 GitHub 仓库 owner 或 Cloudflare 账户 owner 登录
 */

const COOKIE_NAME = 'nexus_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': env.FRONTEND_URL || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    switch (path) {
      case '/login/github':
        return handleGitHubLogin(env);
      case '/callback/github':
        return handleGitHubCallback(request, env);
      case '/login/cloudflare':
        return handleCloudflareLogin(env);
      case '/callback/cloudflare':
        return handleCloudflareCallback(request, env);
      case '/verify':
        return handleVerify(request, env, corsHeaders);
      case '/logout':
        return handleLogout(env, corsHeaders);
      case '/health':
        return Response.json({ status: 'ok' }, { headers: corsHeaders });
      default:
        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    }
  }
};

// ==================== GitHub OAuth ====================

function handleGitHubLogin(env) {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/callback/github`,
    scope: 'read:user',
    state: crypto.randomUUID(),
  });
  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
}

async function handleGitHubCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return Response.redirect(`${env.FRONTEND_URL}?error=no_code`, 302);
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

    // 只允许 GitHub owner 登录
    if (user.login.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) {
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302);
    }

    const token = await generateToken({ provider: 'github', id: user.login, name: user.login, avatar: user.avatar_url }, env);
    return createAuthResponse(token, env);
  } catch (e) {
    console.error('GitHub OAuth error:', e);
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302);
  }
}

// ==================== Cloudflare OAuth ====================

function handleCloudflareLogin(env) {
  const params = new URLSearchParams({
    client_id: env.CF_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/callback/cloudflare`,
    response_type: 'code',
    scope: 'openid profile email',
  });
  return Response.redirect(`https://dash.cloudflare.com/oauth2/authorize?${params}`, 302);
}

async function handleCloudflareCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return Response.redirect(`${env.FRONTEND_URL}?error=no_code`, 302);
  }

  try {
    const tokenRes = await fetch('https://dash.cloudflare.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.CF_CLIENT_ID,
        client_secret: env.CF_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${env.WORKER_URL}/callback/cloudflare`,
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return Response.redirect(`${env.FRONTEND_URL}?error=${tokenData.error}`, 302);
    }

    const userRes = await fetch('https://api.cloudflare.com/client/v4/user', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });

    const userData = await userRes.json();
    if (!userData.success) {
      return Response.redirect(`${env.FRONTEND_URL}?error=cf_user_failed`, 302);
    }

    const user = userData.result;

    // 只允许 Cloudflare owner 登录（通过邮箱验证）
    if (user.email.toLowerCase() !== env.CF_OWNER_EMAIL.toLowerCase()) {
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302);
    }

    const token = await generateToken({ provider: 'cloudflare', id: user.id, name: user.email.split('@')[0], email: user.email }, env);
    return createAuthResponse(token, env);
  } catch (e) {
    console.error('Cloudflare OAuth error:', e);
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302);
  }
}

// ==================== 通用方法 ====================

async function handleVerify(request, env, corsHeaders) {
  // 优先从 Authorization header 获取 token
  const authHeader = request.headers.get('Authorization') || '';
  let token = authHeader.replace('Bearer ', '');
  
  // 兼容 Cookie 方式
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
  // 通过 URL 参数传递 token，前端存到 localStorage
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
