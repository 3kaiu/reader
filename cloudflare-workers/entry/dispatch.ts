import { getCorsHeaders } from '../shared/cors.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import { dispatchEdgeGatewayRoute } from '../worker/edge-gateway.ts'
import { dispatchUserServiceRoute, type UserServiceContainer } from '../worker/user-services.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

export function createStableDispatcher(
  env: EnhancedWorkerEnv,
  ctx: ExecutionContextLike,
  userServices: UserServiceContainer
) {
  return async function dispatchStable(incomingRequest: Request): Promise<Response> {
    const origin = incomingRequest.headers.get('Origin') || ''

    const gatewayResponse = await dispatchEdgeGatewayRoute(incomingRequest, env, ctx)
    if (gatewayResponse) {
      return gatewayResponse
    }

    const userServiceResponse = await dispatchUserServiceRoute(incomingRequest, env, userServices)
    if (userServiceResponse) {
      return userServiceResponse
    }

    return new Response('Not Found', { status: 404, headers: getCorsHeaders(origin) })
  }
}
