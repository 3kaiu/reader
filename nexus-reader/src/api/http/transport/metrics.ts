import { perfMonitor } from '@/services/performance/monitor'
import type { InternalApiFetchOptions } from '../types'

function getObservedRoute(options: InternalApiFetchOptions): 'direct' | 'edge' {
  return options._usedDirect === true ? 'direct' : 'edge'
}

/**
 * Coarse buckets for dashboards — stable names; longer/more specific API prefixes first
 * so `/api/bookshelf` never matches `/api/book`.
 */
const ROUTE_CLASS_RULES: readonly { prefix: string; routeClass: string }[] = [
  { prefix: '/api/batch/content', routeClass: 'content' },
  { prefix: '/api/content', routeClass: 'content' },
  { prefix: '/api/chapters', routeClass: 'chapters' },
  { prefix: '/api/bookshelf', routeClass: 'bookshelf' },
  { prefix: '/api/groups', routeClass: 'bookshelf' },
  { prefix: '/api/book', routeClass: 'book' },
  { prefix: '/api/search', routeClass: 'search' },
  { prefix: '/api/discovery', routeClass: 'discovery' },
  { prefix: '/api/source-packages', routeClass: 'sources' },
  { prefix: '/api/source-builder', routeClass: 'sources' },
  { prefix: '/api/sources', routeClass: 'sources' },
  { prefix: '/api/replace_rules', routeClass: 'replace_rules' },
  { prefix: '/api/engine', routeClass: 'engine' },
  { prefix: '/api/fetch', routeClass: 'fetch' },
  { prefix: '/ws/', routeClass: 'ws' },
  { prefix: '/auth/', routeClass: 'auth' },
  { prefix: '/progress/', routeClass: 'progress' },
]

function classifyApiRouteClass(pathname: string): string {
  for (const { prefix, routeClass } of ROUTE_CLASS_RULES) {
    if (prefix.endsWith('/')) {
      if (pathname.startsWith(prefix)) return routeClass
      continue
    }
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return routeClass
    }
  }
  if (pathname.startsWith('/api/')) return 'api_other'
  return 'other'
}

export function recordApiMetric(
  responseUrl: string,
  options: InternalApiFetchOptions,
  responseTime: number,
  metricName: 'api_response_ms' | 'api_error_duration',
  status: number
): void {
  const endpoint = new URL(responseUrl).pathname
  const route = getObservedRoute(options)
  const method = options._method || 'GET'
  const routeClass = classifyApiRouteClass(endpoint)

  perfMonitor.record({
    name: 'api_route',
    value: 1,
    unit: 'ms',
    tags: {
      endpoint,
      status,
      route,
      method,
      route_class: routeClass,
    },
  })

  perfMonitor.record({
    name: metricName,
    value: Number(responseTime.toFixed(2)),
    unit: 'ms',
    tags:
      metricName === 'api_error_duration'
        ? {
            status,
            endpoint,
            url: options._requestUrl || responseUrl,
            method,
            route,
            route_class: routeClass,
          }
        : {
            endpoint,
            status,
            route,
            method,
            route_class: routeClass,
          },
  })
}
