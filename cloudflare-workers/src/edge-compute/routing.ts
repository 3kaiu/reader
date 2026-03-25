import type { EnhancedWorkerEnv } from '../../worker/types.ts'
import type {
  EdgeRequestDispatcher,
  EdgeRouteEnv,
  UserContext,
} from './types.ts'

export async function processOptimizedRequest(
  request: Request,
  env: EnhancedWorkerEnv,
  userContext: UserContext,
  dispatcher?: EdgeRequestDispatcher
): Promise<Response> {
  if (dispatcher) {
    return dispatcher.dispatch(request, env, userContext)
  }

  return routeToOptimalEndpoint(request, env)
}

export async function routeToOptimalEndpoint(
  request: Request,
  env: EdgeRouteEnv
): Promise<Response> {
  const targetUrl = env.NEXUS_LITE_URL || env.nexusLiteUrl
  if (!targetUrl) {
    return new Response(
      JSON.stringify({
        code: 'MISSING_DISPATCHER',
        message: 'EdgeComputeEngine requires a dispatcher or NEXUS_LITE_URL',
      }),
      {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  const sourceUrl = new URL(request.url)
  const target = new URL(sourceUrl.pathname + sourceUrl.search, targetUrl)
  const headers = new Headers(request.headers)
  headers.delete('host')

  return fetch(target.toString(), {
    method: request.method,
    headers,
    body:
      request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.clone().text()
        : null,
  })
}
