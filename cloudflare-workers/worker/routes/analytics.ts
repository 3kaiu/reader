import { verifyAuth } from '../../shared/auth.ts'
import {
  clearAgentConfigOverride,
  getEffectiveAgentConfig,
  listAgentConfigAuditPage,
  saveAgentConfigPatch,
} from '../../shared/agent-config.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { jsonError } from '../http.ts'
import { corsHeaders, getClientMetrics, getErrorMessage, isRecord } from './shared.ts'

type ClientRoutingEvent = Record<string, unknown>

async function ensureClientMetricsTable(env: EnhancedWorkerEnv): Promise<void> {
  await env.ANALYTICS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS client_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT,
      user_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).bind().run()
}

async function ensureClientRoutingTable(env: EnhancedWorkerEnv): Promise<void> {
  await env.ANALYTICS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS client_routing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT,
      user_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).bind().run()
}

function readRequestId(request: Request): string | null {
  return (
    request.headers.get('X-Request-ID') ||
    request.headers.get('x-request-id') ||
    request.headers.get('X-Request-Id')
  )
}

export async function handleClientMetrics(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  try {
    const body: unknown = await request.json()
    const metrics = getClientMetrics(body)
    await ensureClientMetricsTable(env)
    const requestId = readRequestId(request)
    await env.ANALYTICS_DB.prepare(
      `INSERT INTO client_metrics (request_id, user_id, payload_json) VALUES (?, ?, ?)`
    )
      .bind(requestId, payload.id, JSON.stringify({ metrics }))
      .run()

    return new Response(JSON.stringify({ success: true, received: metrics.length }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(request, 'CLIENT_METRICS_FAILED', 'Client metrics ingest failed', 500, getErrorMessage(error))
  }
}

export async function handleClientRoutingAnalytics(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  try {
    const body: unknown = await request.json()
    const event: ClientRoutingEvent = isRecord(body) ? body : {}
    await ensureClientRoutingTable(env)
    const requestId = readRequestId(request)
    await env.ANALYTICS_DB.prepare(
      `INSERT INTO client_routing_events (request_id, user_id, payload_json) VALUES (?, ?, ?)`
    )
      .bind(requestId, payload.id, JSON.stringify(event))
      .run()

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'CLIENT_ROUTING_FAILED',
      'Client routing analytics ingest failed',
      500,
      getErrorMessage(error)
    )
  }
}

export async function handleAgentRouterStats(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  try {
    const effective = await getEffectiveAgentConfig(env)
    return new Response(JSON.stringify({ success: true, ...effective }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(request, 'AGENT_STATS_FAILED', 'Agent router stats failed', 500, getErrorMessage(error))
  }
}

export async function handleAgentRouterConfig(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  try {
    if (request.method === 'GET') {
      const effective = await getEffectiveAgentConfig(env)
      return new Response(JSON.stringify({ success: true, ...effective }), {
        headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
      })
    }

    if (request.method === 'POST') {
      const body: unknown = await request.json()
      const saved = await saveAgentConfigPatch(env, body, payload.id)
      return new Response(JSON.stringify({ success: true, ...saved }), {
        headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
      })
    }

    if (request.method === 'DELETE') {
      const config = await clearAgentConfigOverride(env)
      return new Response(JSON.stringify({ success: true, config }), {
        headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
      })
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  } catch (error) {
    return jsonError(request, 'AGENT_CONFIG_FAILED', 'Agent router config failed', 500, getErrorMessage(error))
  }
}

export async function handleAgentRouterConfigAudit(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  try {
    const limit = request.url ? new URL(request.url).searchParams.get('limit') : null
    const cursor = request.url ? new URL(request.url).searchParams.get('cursor') : null
    const page = await listAgentConfigAuditPage(env, {
      ...(limit ? { limit: Number(limit) } : {}),
      cursor,
    })
    return new Response(JSON.stringify({ success: true, ...page }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'AGENT_CONFIG_AUDIT_FAILED',
      'Agent router config audit failed',
      500,
      getErrorMessage(error)
    )
  }
}

