import { verifyAuth, generateToken, type TokenPayload } from '../shared/auth.ts'
import { createLogger } from '../shared/logger.ts'
import { getCorsHeaders } from '../shared/cors.ts'
import { DecoderEngine } from '../decoder/decoder-engine.ts'
import type { DecodeRequest, Progress } from '../shared/types.ts'
import type { EnhancedWorkerEnv } from './types.ts'
import type { AnalyticsSystem, UserPreferencesSystem, ContentManagementSystem, QueueProcessor } from './systems.ts'
import { jsonError } from './http.ts'

const OAUTH_STATE_TTL = 600 // 10 minutes
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days

function corsHeaders(request: Request): Record<string, string> {
  return getCorsHeaders(request.headers.get('Origin') || '')
}

export async function handleHealthCheck(request: Request, env: EnhancedWorkerEnv, analytics: AnalyticsSystem): Promise<Response> {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      d1_database: true,
      r2_storage: true,
      analytics_engine: true,
      queues: true
    },
    services: {
      kv_cache: true,
      analytics: true,
      backup: true
    }
  }

  await analytics.recordUserAction('system', 'health_check', {
    ip: request.headers.get('CF-Connecting-IP')
  })

  return new Response(JSON.stringify(healthData), {
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  })
}

export async function handleUserStats(request: Request, env: EnhancedWorkerEnv, analytics: AnalyticsSystem): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const stats = await analytics.getUserStats(payload.id)
  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  })
}

export async function handlePopularContent(_request: Request, _env: EnhancedWorkerEnv, analytics: AnalyticsSystem): Promise<Response> {
  const popularContent = await analytics.getPopularContent()
  return new Response(JSON.stringify({ content: popularContent }), {
    headers: {
      ...getCorsHeaders(''),
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300'
    }
  })
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}

export async function handleClientRoutingAnalytics(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })

  let routeCounts: Record<string, number> = {}
  try {
    const countsRes: any = await env.ANALYTICS_ENGINE.query(`
      SELECT
        blob3 as route,
        sum(double2) as cnt
      FROM analytics_metrics
      WHERE index1 = 'client_metrics'
        AND blob2 = 'api_route'
        AND timestamp > now() - interval '24 hours'
      GROUP BY blob3
    `)
    const rows = (countsRes?.results || countsRes?.result || countsRes) as any[]
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const k = String(r.route ?? 'unknown')
        const v = Number(r.cnt ?? 0)
        routeCounts[k] = (routeCounts[k] || 0) + v
      }
    }
  } catch {
    routeCounts = {}
  }

  const routeLatencies: Record<string, number[]> = {}
  const sampleLimit = 5000
  try {
    const latRes: any = await env.ANALYTICS_ENGINE.query(`
      SELECT
        blob3 as route,
        double1 as ms
      FROM analytics_metrics
      WHERE index1 = 'client_metrics'
        AND blob2 = 'api_response_ms'
        AND timestamp > now() - interval '24 hours'
      LIMIT ${sampleLimit}
    `)
    const rows = (latRes?.results || latRes?.result || latRes) as any[]
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const route = String(r.route ?? 'unknown')
        const ms = Number(r.ms ?? 0)
        if (!Number.isFinite(ms) || ms < 0) continue
        ;(routeLatencies[route] ||= []).push(ms)
      }
    }
  } catch {
    // ignore
  }

  const latencySummary: Record<string, { samples: number; p50: number; p95: number; avg: number }> = {}
  for (const [route, arr] of Object.entries(routeLatencies)) {
    arr.sort((a, b) => a - b)
    const sum = arr.reduce((acc, v) => acc + v, 0)
    latencySummary[route] = {
      samples: arr.length,
      p50: Number(percentile(arr, 0.5).toFixed(2)),
      p95: Number(percentile(arr, 0.95).toFixed(2)),
      avg: arr.length ? Number((sum / arr.length).toFixed(2)) : 0,
    }
  }

  const total = Object.values(routeCounts).reduce((a, b) => a + b, 0) || 0
  const share: Record<string, number> = {}
  for (const [route, cnt] of Object.entries(routeCounts)) {
    share[route] = total ? Number(((cnt / total) * 100).toFixed(2)) : 0
  }

  return new Response(JSON.stringify({
    window: '24h',
    routeCounts,
    routeSharePct: share,
    latencySummary,
    note: `Latency percentiles are computed from up to ${sampleLimit} sampled points.`,
  }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  })
}

export async function handleUserPreferences(request: Request, env: EnhancedWorkerEnv, userPrefs: UserPreferencesSystem): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const userId = payload.id
  if (request.method === 'GET') {
    const preferences = await userPrefs.getPreferences(userId)
    return new Response(JSON.stringify(preferences), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
    })
  }

  if (request.method === 'POST') {
    const preferences = await request.json()
    await userPrefs.savePreferences(userId, preferences)
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(request) })
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
}

export async function handleContentUpload(request: Request, env: EnhancedWorkerEnv, contentManager: ContentManagementSystem): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return jsonError(request, 'BAD_REQUEST', 'No file provided', 400)

    const content = await file.arrayBuffer()
    const key = await contentManager.uploadUserContent(payload.id, file.name, content)

    return new Response(JSON.stringify({
      success: true,
      key,
      url: `https://content.nexus-reader.pages.dev/${key}`
    }), { headers: corsHeaders(request) })
  } catch (error: any) {
    return jsonError(request, 'UPLOAD_FAILED', 'Upload failed', 500, error?.message)
  }
}

export async function handleUserBackup(request: Request, env: EnhancedWorkerEnv, contentManager: ContentManagementSystem, queueProcessor: QueueProcessor): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const userId = payload.id
  await queueProcessor.queueAnalyticsEvent('backup_request', { userId, timestamp: new Date().toISOString() })
  const backupKey = await contentManager.createUserBackup(userId)

  return new Response(JSON.stringify({
    success: true,
    backupKey,
    message: 'Backup queued and initial backup created'
  }), { headers: corsHeaders(request) })
}

export async function handleClientMetrics(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })

  const payload = await verifyAuth(request, env)
  const userId = payload?.id || 'anonymous'

  let body: any
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }

  const metrics = Array.isArray(body?.metrics) ? body.metrics : []
  if (metrics.length === 0) {
    return new Response(JSON.stringify({ success: true, ingested: 0 }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
    })
  }

  const bounded = metrics.slice(0, 200)
  for (const m of bounded) {
    try {
      const route = String(m?.tags?.route ?? 'unknown')
      const metricName = String(m?.name ?? 'unknown')
      const endpoint = String(m?.tags?.endpoint ?? m?.tags?.url ?? 'unknown')
      const method = String(m?.tags?.method ?? 'unknown')
      const value = Number(m?.value ?? 0)

      await env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [userId, metricName, route, method, endpoint],
        doubles: [value, 1.0],
        indexes: ['client_metrics'],
      })
    } catch {
      // ignore bad datapoints
    }
  }

  return new Response(JSON.stringify({ success: true, ingested: bounded.length }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  })
}

export async function handleGitHubLogin(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const state = crypto.randomUUID()
  if (env.PROGRESS_KV) {
    await env.PROGRESS_KV.put(`oauth_state:${state}`, Date.now().toString(), {
      expirationTtl: OAUTH_STATE_TTL
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
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })

    const tokenData = await tokenRes.json() as any
    if (tokenData.error) return Response.redirect(`${env.FRONTEND_URL}?error=${tokenData.error}`, 302)

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Nexus-Reader-Unified'
      },
    })

    const user = await userRes.json() as any
    if (user.login.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) {
      logger.warn(`Unauthorized login attempt by ${user.login}`)
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302)
    }

    const payload: TokenPayload = {
      provider: 'github',
      id: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
      exp: Date.now() + COOKIE_MAX_AGE * 1000
    }

    const token = await generateToken(payload, env.AUTH_SECRET)
    const redirectUrl = new URL(env.FRONTEND_URL)
    redirectUrl.searchParams.set('token', token)
    return Response.redirect(redirectUrl.toString(), 302)
  } catch (e) {
    logger.error('GitHub OAuth error:', e)
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302)
  }
}

export async function handleAuthVerify(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  return new Response(JSON.stringify({
    valid: Boolean(payload),
    user: payload || null
  }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  })
}

export async function handleDecodeRequest(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  if (!env.DECODER_KV || !env.AI_CACHE_KV) {
    const res = jsonError(request, 'DECODE_UNAVAILABLE', 'Decode temporarily unavailable', 503, 'Missing DECODER_KV/AI_CACHE_KV bindings')
    res.headers.set('Retry-After', '60')
    return res
  }

  const decoder = new DecoderEngine(env)
  await decoder.init()
  const decodeRequest: DecodeRequest = await request.json()
  const result = await decoder.decode(decodeRequest)

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' }
  })
}

export async function handleProgressSync(request: Request, env: EnhancedWorkerEnv, url: URL): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const parts = url.pathname.split('/').filter(Boolean)
  const bookId = parts[1]
  if (!bookId) return jsonError(request, 'BAD_REQUEST', 'Missing bookId', 400)

  const key = `progress:${payload.id}:${bookId}`

  if (request.method === 'GET') {
    const value = await env.PROGRESS_KV.get(key)
    if (!value) return jsonError(request, 'NOT_FOUND', 'Not Found', 404)
    return new Response(value, { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
  }

  if (request.method === 'DELETE') {
    await env.PROGRESS_KV.delete(key)
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
  }

  if (request.method !== 'PUT' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  const body = await request.json() as Partial<Progress>
  const progress: Progress = {
    bookId,
    chapterIndex: Number(body.chapterIndex ?? 0),
    scrollPercent: Number(body.scrollPercent ?? 0),
    updatedAt: Date.now(),
  }

  await env.PROGRESS_KV.put(key, JSON.stringify(progress), { expirationTtl: 30 * 24 * 60 * 60 })
  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
}

