import { perfMonitor } from '@/services/performance/monitor'
import type { InternalApiFetchOptions } from '../types'

function getObservedRoute(options: InternalApiFetchOptions): 'direct' | 'edge' {
  return options._usedDirect === true ? 'direct' : 'edge'
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

  perfMonitor.record({
    name: 'api_route',
    value: 1,
    unit: 'ms',
    tags: {
      endpoint,
      status,
      route,
      method,
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
          }
        : {
            endpoint,
            status,
            route,
            method,
          },
  })
}
