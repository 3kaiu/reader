import { getCorsHeaders } from '../shared/cors.ts'
import { proxyRequestWithEnv } from '../shared/proxy.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

export function createStableDispatcher(
  env: EnhancedWorkerEnv,
  ctx: ExecutionContextLike
) {
  return async function dispatchStable(incomingRequest: Request): Promise<Response> {
    const origin = incomingRequest.headers.get('Origin') || ''
    const url = new URL(incomingRequest.url)

    if (url.pathname.startsWith('/api/')) {
      return proxyRequestWithEnv(incomingRequest, env, ctx)
    }

    return new Response('Not Found', { status: 404, headers: getCorsHeaders(origin, env) })
  }
}
