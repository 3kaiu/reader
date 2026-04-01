import { verifyAuth } from '../../shared/auth.ts'
import {
  clearAgentConfigOverride,
  getEffectiveAgentConfig,
  listAgentConfigAuditPage,
  saveAgentConfigPatch,
} from '../../shared/agent-config.ts'
import { getCorsHeaders } from '../../shared/cors.ts'
import { jsonError } from '../http.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import type { AnalyticsSystem } from '../systems.ts'
import {
  corsHeaders,
  getAnalyticsRows,
  getClientMetrics,
  getErrorMessage,
  isRecord,
  percentile,
} from './shared.ts'

export async function handleHealthCheck(
  request: Request,
  _env: EnhancedWorkerEnv,
  analytics: AnalyticsSystem
): Promise<Response> {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      d1_database: true,
      r2_storage: true,
      analytics_engine: true,
      queues: true,
    },
    services: {
      kv_cache: true,
      analytics: true,
      backup: true,
    },
  }

  await analytics.recordUserAction('system', 'health_check', {
    ip: request.headers.get('CF-Connecting-IP'),
  })

  return new Response(JSON.stringify(healthData), {
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    }
  })
}

export async function handleUserStats(
  request: Request,
  env: EnhancedWorkerEnv,
  analytics: AnalyticsSystem
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const stats = await analytics.getUserStats(payload.id)
  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export async function handlePopularContent(
  _request: Request,
  _env: EnhancedWorkerEnv,
  analytics: AnalyticsSystem
): Promise<Response> {
  const popularContent = await analytics.getPopularContent()
  return new Response(JSON.stringify({ content: popularContent }), {
    headers: {
      ...getCorsHeaders(''),
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  })
}

export async function handleClientRoutingAnalytics(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  let routeCounts: Record<string, number> = {}
  try {
    const countsRes: unknown = await env.ANALYTICS_ENGINE.query(`
      SELECT
        blob3 as route,
        sum(double2) as cnt
      FROM analytics_metrics
      WHERE index1 = 'client_metrics'
        AND blob2 = 'api_route'
        AND timestamp > now() - interval '24 hours'
      GROUP BY blob3
    `)
    const rows = getAnalyticsRows(countsRes)
    for (const r of rows) {
      const key = String(r.route ?? 'unknown')
      const value = Number(r.cnt ?? 0)
      routeCounts[key] = (routeCounts[key] || 0) + value
    }
  } catch {
    routeCounts = {}
  }

  const routeLatencies: Record<string, number[]> = {}
  const sampleLimit = 5000
  try {
    const latRes: unknown = await env.ANALYTICS_ENGINE.query(`
      SELECT
        blob3 as route,
        double1 as ms
      FROM analytics_metrics
      WHERE index1 = 'client_metrics'
        AND blob2 = 'api_response_ms'
        AND timestamp > now() - interval '24 hours'
      LIMIT ${sampleLimit}
    `)
    const rows = getAnalyticsRows(latRes)
    for (const row of rows) {
      const route = String(row.route ?? 'unknown')
      const ms = Number(row.ms ?? 0)
      if (!Number.isFinite(ms) || ms < 0) continue
      ;(routeLatencies[route] ||= []).push(ms)
    }
  } catch {
    // ignore
  }

  const latencySummary: Record<string, { samples: number; p50: number; p95: number; avg: number }> = {}
  for (const [route, arr] of Object.entries(routeLatencies)) {
    arr.sort((a, b) => a - b)
    const sum = arr.reduce((acc, value) => acc + value, 0)
    latencySummary[route] = {
      samples: arr.length,
      p50: Number(percentile(arr, 0.5).toFixed(2)),
      p95: Number(percentile(arr, 0.95).toFixed(2)),
      avg: arr.length ? Number((sum / arr.length).toFixed(2)) : 0,
    }
  }

  const total = Object.values(routeCounts).reduce((a, b) => a + b, 0) || 0
  const share: Record<string, number> = {}
  for (const [route, count] of Object.entries(routeCounts)) {
    share[route] = total ? Number(((count / total) * 100).toFixed(2)) : 0
  }

  return new Response(JSON.stringify({
    window: '24h',
    routeCounts,
    routeSharePct: share,
    latencySummary,
    note: `Latency percentiles are computed from up to ${sampleLimit} sampled points.`,
  }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export async function handleClientMetrics(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  const payload = await verifyAuth(request, env)
  const userId = payload?.id || 'anonymous'

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }

  const metrics = getClientMetrics(body)
  if (metrics.length === 0) {
    return new Response(JSON.stringify({ success: true, ingested: 0 }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  }

  const bounded = metrics.slice(0, 200)
  for (const metric of bounded) {
    try {
      const tags = isRecord(metric.tags) ? metric.tags : {}
      const route = String(tags.route ?? 'unknown')
      const metricName = String(metric.name ?? 'unknown')
      const endpoint = String(tags.endpoint ?? tags.url ?? 'unknown')
      const method = String(tags.method ?? 'unknown')
      const value = Number(metric.value ?? 0)

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
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export async function handleAgentRouterStats(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  let strategyCounts: Record<string, number> = {}
  let skillCounts: Record<string, number> = {}
  let strategyConfidence: Record<string, { avg: number; samples: number }> = {}

  try {
    const strategyRes: unknown = await env.ANALYTICS_ENGINE.query(`
      SELECT
        blob2 as strategy,
        sum(double2) as cnt,
        avg(double1) as confidence
      FROM analytics_metrics
      WHERE index1 = 'agent_router'
        AND blob1 = 'agent'
        AND timestamp > now() - interval '24 hours'
      GROUP BY blob2
    `)
    const rows = getAnalyticsRows(strategyRes)
    for (const row of rows) {
      const strategy = String(row.strategy ?? 'unknown')
      const count = Number(row.cnt ?? 0)
      const avg = Number(row.confidence ?? 0)
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + count
      strategyConfidence[strategy] = {
        avg: Number(avg.toFixed(4)),
        samples: count,
      }
    }
  } catch {
    strategyCounts = {}
    strategyConfidence = {}
  }

  try {
    const skillRes: unknown = await env.ANALYTICS_ENGINE.query(`
      SELECT
        blob3 as skill,
        sum(double2) as cnt
      FROM analytics_metrics
      WHERE index1 = 'agent_router'
        AND blob1 = 'agent'
        AND timestamp > now() - interval '24 hours'
      GROUP BY blob3
      ORDER BY cnt DESC
      LIMIT 50
    `)
    const rows = getAnalyticsRows(skillRes)
    for (const row of rows) {
      const skill = String(row.skill ?? 'unknown')
      const count = Number(row.cnt ?? 0)
      skillCounts[skill] = (skillCounts[skill] || 0) + count
    }
  } catch {
    skillCounts = {}
  }

  const total = Object.values(strategyCounts).reduce((a, b) => a + b, 0) || 0
  const strategySharePct: Record<string, number> = {}
  for (const [strategy, count] of Object.entries(strategyCounts)) {
    strategySharePct[strategy] = total ? Number(((count / total) * 100).toFixed(2)) : 0
  }

  const aiLike =
    (strategyCounts.ai || 0) +
    (strategyCounts['ai-low-confidence'] || 0) +
    (strategyCounts['ai-timeout'] || 0) +
    (strategyCounts['ai-failed'] || 0)
  const fallbackLike =
    (strategyCounts.rule || 0) +
    (strategyCounts['ai-low-confidence'] || 0) +
    (strategyCounts['ai-timeout'] || 0) +
    (strategyCounts['ai-failed'] || 0)

  return new Response(JSON.stringify({
    window: '24h',
    totalSelections: total,
    strategyCounts,
    strategySharePct,
    strategyConfidence,
    skillCounts,
    summary: {
      aiAttemptRatePct: total ? Number(((aiLike / total) * 100).toFixed(2)) : 0,
      fallbackRatePct: total ? Number(((fallbackLike / total) * 100).toFixed(2)) : 0,
      aiTimeoutRatePct: total ? Number((((strategyCounts['ai-timeout'] || 0) / total) * 100).toFixed(2)) : 0,
    },
  }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export async function handleAgentRouterConfig(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method === 'GET') {
    const effective = await getEffectiveAgentConfig(env)
    return new Response(JSON.stringify({
      window: 'runtime',
      source: effective.source,
      overrideUpdatedAt: effective.overrideUpdatedAt ?? null,
      overrideUpdatedBy: effective.overrideUpdatedBy ?? null,
      config: effective.config,
    }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  }

  if (request.method === 'PATCH') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
    }

    try {
      const saved = await saveAgentConfigPatch(env, body, payload.id)
      return new Response(JSON.stringify({
        success: true,
        updatedAt: saved.updatedAt,
        updatedBy: saved.updatedBy ?? null,
        config: saved.config,
      }), {
        headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
      })
    } catch (error: unknown) {
      return jsonError(request, 'BAD_REQUEST', 'Invalid agent config patch', 400, getErrorMessage(error))
    }
  }

  if (request.method === 'DELETE') {
    try {
      const config = await clearAgentConfigOverride(env)
      return new Response(JSON.stringify({
        success: true,
        cleared: true,
        config,
      }), {
        headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
      })
    } catch (error: unknown) {
      return jsonError(request, 'BAD_REQUEST', 'Failed to clear agent config override', 400, getErrorMessage(error))
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
}

export async function handleAgentRouterConfigAudit(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  const url = new URL(request.url)
  const limitRaw = url.searchParams.get('limit')
  const cursor = url.searchParams.get('cursor')
  const limit = limitRaw ? Number(limitRaw) : 20
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 20
  const { records, nextCursor } = await listAgentConfigAuditPage(env, {
    limit: boundedLimit,
    cursor,
  })

  return new Response(JSON.stringify({
    window: 'recent',
    count: records.length,
    nextCursor,
    records,
  }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}
