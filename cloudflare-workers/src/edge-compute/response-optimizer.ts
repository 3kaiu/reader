import { asNumber } from './helpers.ts'
import type {
  ContentPolicySnapshot,
  EdgeLocation,
  UserContext,
} from './types.ts'

export function optimizeEdgeResponse(
  response: Response,
  userContext: UserContext,
  edgeLocation: EdgeLocation,
  contentPolicy: ContentPolicySnapshot
): Response {
  const optimizedHeaders = new Headers(response.headers)
  const ttlFromPolicy = contentPolicy.cacheTtlByColo[edgeLocation.colo]
  const ttlByRegion = userContext.location.continent === 'Asia' ? 300 : 600
  const cacheTtl = asNumber(ttlFromPolicy, ttlByRegion)
  const compressionFromPolicy = contentPolicy.compressionByColo[edgeLocation.colo]

  optimizedHeaders.set('CF-Cache-Status', 'HIT')
  optimizedHeaders.set('CF-Edge-Location', edgeLocation.colo)
  optimizedHeaders.set('Cache-Control', `public, max-age=${Math.max(60, cacheTtl)}`)

  if (userContext.device.type === 'mobile') {
    optimizedHeaders.set('CF-Mobile-Optimized', 'true')
  }

  if (compressionFromPolicy) {
    optimizedHeaders.set('CF-Compress', compressionFromPolicy)
  } else if (userContext.network.bandwidth < 20) {
    optimizedHeaders.set('CF-Compress', 'aggressive')
  } else {
    optimizedHeaders.set('CF-Compress', 'balanced')
  }

  if (contentPolicy.prefetchColos.includes(edgeLocation.colo)) {
    optimizedHeaders.set('CF-Edge-Prefetch', 'enabled')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: optimizedHeaders,
  })
}
