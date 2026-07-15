import { getCorsHeaders } from '../shared/cors.ts'
import { proxyRequestWithEnv } from '../shared/proxy.ts'
import type { ExecutionContextLike } from '../shared/types.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'
import { API_ALLOWED_SEGMENTS, EDGE_HANDLED_PREFIXES } from './dispatch.constants.generated.ts'

function isAllowedApiPath(pathname: string): boolean {
  // pathname starts with /api/
  const segments = pathname.split('/')
  // segments[0] is '' (leading /), segments[1] is 'api'
  return segments[2] !== undefined && API_ALLOWED_SEGMENTS.has(segments[2])
}

function isEdgeHandledPath(pathname: string): boolean {
  for (const prefix of EDGE_HANDLED_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true
    }
  }
  return false
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
      
      // Enable edge caching for edge-handled paths (GET requests only)
      const useEdgeCache = isEdgeHandledPath(url.pathname) && incomingRequest.method === 'GET'
      
      return proxyRequestWithEnv(incomingRequest, env, ctx, { useCache: useEdgeCache })
    }

    return new Response('Not Found', { status: 404, headers: getCorsHeaders(origin, env) })
  }
}
