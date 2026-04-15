import { getCorsHeaders } from '../shared/cors.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import { dispatchEdgeGatewayRoute } from '../worker/edge-gateway.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

export function createStableDispatcher(
  env: EnhancedWorkerEnv,
  ctx: ExecutionContextLike
) {
  return async function dispatchStable(incomingRequest: Request): Promise<Response> {
    const origin = incomingRequest.headers.get('Origin') || ''

    const gatewayResponse = await dispatchEdgeGatewayRoute(incomingRequest, env, ctx)
    if (gatewayResponse) {
      return gatewayResponse
    }

    return new Response('Not Found', { status: 404, headers: getCorsHeaders(origin, env) })
  }
}
