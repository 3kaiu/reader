import { proxyRequestWithEnv } from '../shared/proxy.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import type { EnhancedWorkerEnv } from './types.ts'

export async function dispatchEdgeGatewayRoute(
  request: Request,
  env: EnhancedWorkerEnv,
  ctx: ExecutionContextLike
): Promise<Response | undefined> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    return proxyRequestWithEnv(request, env, ctx)
  }

  return undefined
}
