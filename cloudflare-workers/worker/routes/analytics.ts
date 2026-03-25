import { verifyAuth } from '../../shared/auth.ts'
import { getCorsHeaders } from '../../shared/cors.ts'
import { jsonError } from '../http.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import type { AnalyticsSystem } from '../systems.ts'
import {
  corsHeaders,
  getAnalyticsRows,
  getClientMetrics,
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
