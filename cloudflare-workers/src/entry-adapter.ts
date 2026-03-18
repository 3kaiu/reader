import type { EnhancedWorkerEnv } from '../worker/types.ts'

type StableDispatcher = (request: Request) => Promise<Response>

interface LoggerLike {
  warn: (...args: any[]) => void
}

const DEFAULT_ROUTES = ['/api/search', '/api/book', '/api/chapters', '/api/content']

function isTrueFlag(value?: string): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function parseRouteRules(value: string | undefined, fallback: string[]): string[] {
  if (!value || !value.trim()) return [...fallback]
  return value
    .split(',')
    .map(rule => rule.trim())
    .filter(Boolean)
}

function matchRoute(pathname: string, rule: string): boolean {
  if (rule === '*') return true

  if (rule.endsWith('*')) {
    return pathname.startsWith(rule.slice(0, -1))
  }

  if (pathname === rule) return true
  const prefix = rule.endsWith('/') ? rule : `${rule}/`
  return pathname.startsWith(prefix)
}

function deterministicPercent(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash % 100
}

function withinRollout(request: Request, env: EnhancedWorkerEnv, headerEnabled: boolean): boolean {
  if (headerEnabled) return true

  const rolloutRaw = env.EDGE_EXPERIMENTAL_ROLLOUT || ''
  const rollout = Number(rolloutRaw)
  const validRollout = Number.isFinite(rollout) ? Math.max(0, Math.min(100, rollout)) : 0
  if (validRollout <= 0) return false
  if (validRollout >= 100) return true

  const seed =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Request-ID') ||
    request.url
  return deterministicPercent(seed) < validRollout
}

function shouldApplyEdgeOptimization(request: Request, env: EnhancedWorkerEnv): boolean {
  const headerEnabled = isTrueFlag(request.headers.get('X-Edge-Experimental') || undefined)
  const envEnabled = isTrueFlag(env.ENABLE_EDGE_EXPERIMENTAL)
  if (!headerEnabled && !envEnabled) return false

  const url = new URL(request.url)
  const isApiPath = url.pathname.startsWith('/api/')
  const isReadRequest = request.method === 'GET' || request.method === 'HEAD'
  if (!isApiPath || !isReadRequest) return false

  const includeRules = parseRouteRules(env.EDGE_EXPERIMENTAL_ROUTES, DEFAULT_ROUTES)
  const excludeRules = parseRouteRules(env.EDGE_EXPERIMENTAL_EXCLUDE_ROUTES, [])

  const included = includeRules.some(rule => matchRoute(url.pathname, rule))
  if (!included) return false

  const excluded = excludeRules.some(rule => matchRoute(url.pathname, rule))
  if (excluded) return false

  return withinRollout(request, env, headerEnabled)
}

export async function dispatchWithOptionalEdgeOptimization(
  request: Request,
  env: EnhancedWorkerEnv,
  dispatchStable: StableDispatcher,
  logger: LoggerLike
): Promise<Response> {
  if (!shouldApplyEdgeOptimization(request, env)) {
    return dispatchStable(request)
  }

  try {
    const { edgeComputeEngine } = await import('./edge-compute-engine.ts')
    return edgeComputeEngine.processRequest(request, env, {
      dispatch: async (optimizedRequest: Request): Promise<Response> => dispatchStable(optimizedRequest),
    })
  } catch (error) {
    logger.warn('Edge optimization adapter failed, fallback to stable dispatcher', error)
    return dispatchStable(request)
  }
}
