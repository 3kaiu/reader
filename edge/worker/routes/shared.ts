import { getCorsHeaders } from '../../shared/cors.ts'
import type { JsonObject } from '../../shared/types.ts'
import type { EnhancedWorkerEnv } from '../types.ts'

export type AnalyticsQueryRow = Record<string, unknown>

export interface GitHubTokenPayload {
  accessToken: string
  error?: string
}

export interface GitHubUserPayload {
  login: string
  name?: string
  avatarUrl?: string
}

export function corsHeaders(request: Request, env: EnhancedWorkerEnv): Record<string, string> {
  return getCorsHeaders(request.headers.get('Origin') || '', env)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value)
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function getAnalyticsRows(result: unknown): AnalyticsQueryRow[] {
  if (Array.isArray(result)) {
    return result.filter(isRecord)
  }

  if (!isRecord(result)) {
    return []
  }

  if (Array.isArray(result.results)) {
    return result.results.filter(isRecord)
  }

  if (Array.isArray(result.result)) {
    return result.result.filter(isRecord)
  }

  return []
}

export function parseGitHubTokenPayload(value: unknown): GitHubTokenPayload | null {
  if (!isRecord(value)) {
    return null
  }

  const accessToken = typeof value.access_token === 'string' ? value.access_token : ''
  const error = typeof value.error === 'string' ? value.error : undefined

  if (!accessToken && !error) {
    return null
  }

  return { accessToken, error }
}

export function parseGitHubUserPayload(value: unknown): GitHubUserPayload | null {
  if (!isRecord(value) || typeof value.login !== 'string') {
    return null
  }

  return {
    login: value.login,
    name: typeof value.name === 'string' ? value.name : undefined,
    avatarUrl: typeof value.avatar_url === 'string' ? value.avatar_url : undefined,
  }
}

export function getClientMetrics(payload: unknown): AnalyticsQueryRow[] {
  if (!isRecord(payload) || !Array.isArray(payload.metrics)) {
    return []
  }

  return payload.metrics.filter(isRecord)
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}
