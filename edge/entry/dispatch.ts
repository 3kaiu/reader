import { getCorsHeaders } from '../shared/cors.ts'
import { proxyRequestWithEnv } from '../shared/proxy.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

/** Allowed first path segments under /api/. Kept in sync with contracts/http-routes.json. */
const API_ALLOWED_SEGMENTS = new Set([
  'health',
  'sources',
  'source-packages',
  'search',
  'book',
  'chapters',
  'content',
  'batch',
  'bookshelf',
  'groups',
  'replace_rules',
  'explore',
])

function isAllowedApiPath(pathname: string): boolean {
  // pathname starts with /api/
  const segments = pathname.split('/')
  // segments[0] is '' (leading /), segments[1] is 'api'
  return segments[2] !== undefined && API_ALLOWED_SEGMENTS.has(segments[2])
}

export function createStableDispatcher(
  env: EnhancedWorkerEnv
) {
  return async function dispatchStable(
    incomingRequest: Request,
    ctx: ExecutionContextLike
  ): Promise<Response> {
    const origin = incomingRequest.headers.get('Origin') || ''
    const url = new URL(incomingRequest.url)

    if (url.pathname.startsWith('/api/')) {
      if (!isAllowedApiPath(url.pathname)) {
        return new Response('Not Found', {
          status: 404,
          headers: getCorsHeaders(origin, env),
        })
      }
      return proxyRequestWithEnv(incomingRequest, env, ctx)
    }

    return new Response('Not Found', { status: 404, headers: getCorsHeaders(origin, env) })
  }
}
