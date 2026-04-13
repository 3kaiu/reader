import { proxyRequestWithEnv } from '../shared/proxy.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import {
  handleAuthVerify,
  handleGitHubCallback,
  handleGitHubLogin,
  handleProgressSync,
} from './routes.ts'

import type { EnhancedWorkerEnv } from './types.ts'
import { USER_SERVICE_PREFIXES } from './user-service-prefixes.generated.ts'

/** Same semantics as nexus-reader `route-policy.ts` routeMatches (avoid `/api/foo` matching `/api/foobar`). */
function routeMatchesPath(pathname: string, pattern: string): boolean {
  if (pattern.endsWith('/')) return pathname.startsWith(pattern)
  return pathname === pattern || pathname.startsWith(`${pattern}/`)
}

function isUserServiceRoute(pathname: string): boolean {
  return USER_SERVICE_PREFIXES.some(pattern => routeMatchesPath(pathname, pattern))
}

export async function dispatchEdgeGatewayRoute(
  request: Request,
  env: EnhancedWorkerEnv,
  ctx: ExecutionContextLike
): Promise<Response | undefined> {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/auth/github':
      return handleGitHubLogin(request, env)
    case '/auth/github/callback':
      return handleGitHubCallback(request, env)
    case '/auth/verify':
      return handleAuthVerify(request, env)
    default:
      break
  }

  if (url.pathname.startsWith('/progress/')) {
    return handleProgressSync(request, env, url)
  }

  if (url.pathname.startsWith('/api/') && !isUserServiceRoute(url.pathname)) {
    return proxyRequestWithEnv(request, env, ctx)
  }

  return undefined
}
