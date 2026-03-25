import { asString, getCfContext } from './helpers.ts'
import type {
  EdgeLocation,
  EdgeOptimization,
  UserContext,
} from './types.ts'

export function applyEdgeOptimizations(
  request: Request,
  userContext: UserContext,
  edgeLocation: EdgeLocation,
  optimizations: EdgeOptimization[]
): Request {
  let optimizedRequest = request

  for (const optimization of optimizations) {
    if (!shouldApplyOptimization(optimization, edgeLocation)) {
      continue
    }

    switch (optimization.type) {
      case 'latency':
        optimizedRequest = optimizeForLatency(optimizedRequest, userContext)
        break
      case 'bandwidth':
        optimizedRequest = optimizeForBandwidth(optimizedRequest, userContext)
        break
      case 'content':
        optimizedRequest = optimizeContentDelivery(optimizedRequest, userContext)
        break
      case 'computation':
        optimizedRequest = optimizeComputation(optimizedRequest, userContext)
        break
    }
  }

  return optimizedRequest
}

function shouldApplyOptimization(
  optimization: EdgeOptimization,
  edgeLocation: EdgeLocation
): boolean {
  return (
    optimization.targetLocations.includes(edgeLocation.colo) ||
    optimization.targetLocations.includes('global')
  )
}

function optimizeForLatency(request: Request, userContext: UserContext): Request {
  const url = new URL(request.url)

  if (userContext.device.type === 'mobile') {
    url.searchParams.set('mobile', 'true')
  }

  if (userContext.location.continent === 'Asia') {
    url.searchParams.set('region', 'asia')
  }

  return new Request(url.toString(), request)
}

function optimizeForBandwidth(request: Request, userContext: UserContext): Request {
  const url = new URL(request.url)

  if (userContext.network.bandwidth < 10) {
    url.searchParams.set('low_bandwidth', 'true')
  }

  if (userContext.device.type === 'mobile') {
    url.searchParams.set('mobile_optimized', 'true')
  }

  return new Request(url.toString(), request)
}

function optimizeContentDelivery(request: Request, userContext: UserContext): Request {
  const url = new URL(request.url)

  url.searchParams.set('lang', userContext.preferences.language)
  url.searchParams.set('device', userContext.device.type)
  url.searchParams.set('region', userContext.location.country.toLowerCase())

  return new Request(url.toString(), request)
}

function optimizeComputation(request: Request, userContext: UserContext): Request {
  const url = new URL(request.url)
  const cfContext = getCfContext(request)

  url.searchParams.set('colo', asString(cfContext.colo, 'UNKNOWN'))
  url.searchParams.set(
    'compute_priority',
    userContext.network.bandwidth > 50 ? 'high' : 'normal'
  )

  return new Request(url.toString(), request)
}
