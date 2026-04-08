import { proxyRequestWithEnv } from '../shared/proxy.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import {
  handleAuthVerify,
  handleDecodeRequest,
  handleGitHubCallback,
  handleGitHubLogin,
  handleProgressSync,
} from './routes.ts'

import type { EnhancedWorkerEnv } from './types.ts'

const USER_SERVICE_PREFIXES = [
  '/api/health',
  '/api/analytics/',
  '/api/agent/',
  '/api/preferences',
  '/api/content/upload',
  '/api/backup',
  '/api/metrics/client',
  '/api/source/flow-assist',
  '/api/source/flow-assist/feedback',
  '/api/source/flow-assist/stats',
  '/api/source/flow-assist/profile',
  '/api/source/flow-assist/profile/audit',
]

function isUserServiceRoute(pathname: string): boolean {
  return USER_SERVICE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix))
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

  if (url.pathname.startsWith('/decode/')) {
    return handleDecodeRequest(request, env)
  }

  if (url.pathname.startsWith('/progress/')) {
    return handleProgressSync(request, env, url)
  }

  if (url.pathname.startsWith('/api/') && !isUserServiceRoute(url.pathname)) {
    return proxyRequestWithEnv(request, env, ctx)
  }

  return undefined
}
