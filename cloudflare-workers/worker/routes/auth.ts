import { generateToken, verifyAuth, type TokenPayload } from '../../shared/auth.ts'
import { createLogger } from '../../shared/logger.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { corsHeaders, parseGitHubTokenPayload, parseGitHubUserPayload } from './shared.ts'

const OAUTH_STATE_TTL = 600
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60

export async function handleGitHubLogin(_request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const state = crypto.randomUUID()
  if (env.PROGRESS_KV) {
    await env.PROGRESS_KV.put(`oauth_state:${state}`, Date.now().toString(), {
      expirationTtl: OAUTH_STATE_TTL,
    })
  }
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/auth/github/callback`,
    scope: 'read:user',
    state,
  })
  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302)
}

export async function handleGitHubCallback(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const logger = createLogger(env)

  if (!code || !state) {
    return Response.redirect(`${env.FRONTEND_URL}?error=invalid_request`, 302)
  }

  if (env.PROGRESS_KV) {
    const storedState = await env.PROGRESS_KV.get(`oauth_state:${state}`)
    if (!storedState) {
      logger.warn('OAuth state validation failed')
      return Response.redirect(`${env.FRONTEND_URL}?error=invalid_state`, 302)
    }
    await env.PROGRESS_KV.delete(`oauth_state:${state}`)
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })

    const tokenData = parseGitHubTokenPayload(await tokenRes.json())
    if (!tokenData) {
      logger.warn('GitHub token response invalid')
      return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302)
    }
    if (tokenData.error) return Response.redirect(`${env.FRONTEND_URL}?error=${tokenData.error}`, 302)
    if (!tokenData.accessToken) {
      logger.warn('GitHub token missing access_token')
      return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302)
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'User-Agent': 'Nexus-Reader-Unified',
      },
    })

    const user = parseGitHubUserPayload(await userRes.json())
    if (!user) {
      logger.warn('GitHub user response invalid')
      return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302)
    }
    if (user.login.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) {
      logger.warn(`Unauthorized login attempt by ${user.login}`)
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302)
    }

    const payload: TokenPayload = {
      provider: 'github',
      id: user.login,
      name: user.name || user.login,
      avatar: user.avatarUrl,
      exp: Date.now() + COOKIE_MAX_AGE * 1000,
    }

    const token = await generateToken(payload, env.AUTH_SECRET)
    const redirectUrl = new URL(env.FRONTEND_URL)
    redirectUrl.searchParams.set('token', token)
    return Response.redirect(redirectUrl.toString(), 302)
  } catch (error: unknown) {
    logger.error('GitHub OAuth error:', error)
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302)
  }
}

export async function handleAuthVerify(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  return new Response(JSON.stringify({
    valid: Boolean(payload),
    user: payload || null,
  }), {
    headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
  })
}
