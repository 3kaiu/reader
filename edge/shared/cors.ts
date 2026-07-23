/**
 * CORS utilities — centralized handling for all workers.
 */

import type { WorkerEnv } from './types.ts'

const ENVIRONMENT = (import.meta as any).env?.ENVIRONMENT || 'development'
const LOCAL_ORIGINS =
  ENVIRONMENT !== 'production'
    ? (['http://localhost:5173', 'http://localhost:4173'] as const)
    : ([] as const)
const DEFAULT_PAGES_ORIGINS = ['https://nexus.pages.dev', 'https://nexus-reader.pages.dev'] as const

export type CorsEnvSlice = Pick<WorkerEnv, 'FRONTEND_URL' | 'CORS_EXTRA_ORIGINS'>

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/$/, '')
}

/** Merge localhost, default Nexus Pages origins, FRONTEND_URL, and optional comma-separated extras.
 *  Results are cached per env config to avoid re-computation on every request. */
const allowedOriginsCache = new WeakMap<CorsEnvSlice, string[]>()

export function resolveAllowedOrigins(env?: CorsEnvSlice): string[] {
  const key = env || {} as CorsEnvSlice
  const cached = allowedOriginsCache.get(key)
  if (cached) return cached

  const out: string[] = []
  const add = (raw: string) => {
    const o = normalizeOrigin(raw)
    if (!o) return

    // Validate URL format
    try {
      new URL(o)
    } catch {
      console.warn(`Invalid CORS origin format: ${o}`)
      return
    }

    if (!out.includes(o)) out.push(o)
  }
  for (const o of LOCAL_ORIGINS) add(o)
  for (const o of DEFAULT_PAGES_ORIGINS) add(o)
  if (env?.FRONTEND_URL) add(env.FRONTEND_URL)
  if (env?.CORS_EXTRA_ORIGINS) {
    for (const part of env.CORS_EXTRA_ORIGINS.split(',')) add(part)
  }
  allowedOriginsCache.set(key, out)
  return out
}

export function getCorsHeaders(origin: string, env?: CorsEnvSlice): Record<string, string> {
  const allowedOrigins = resolveAllowedOrigins(env)
  const isAllowed = allowedOrigins.includes(origin)
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    // Restrict to actual methods used by the frontend (GET/POST)
    // PUT/DELETE not needed for read-oriented Nexus Reader API
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    ...(isAllowed ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Vary': 'Origin',
  }
}

export function handleCorsPreflightRequest(request: Request, env?: CorsEnvSlice): Response {
  const origin = request.headers.get('Origin') || ''
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin, env),
  })
}
