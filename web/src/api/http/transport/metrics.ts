import type { InternalApiFetchOptions } from '../types'

export function recordApiMetric(
  _responseUrl: string,
  _options: InternalApiFetchOptions,
  _responseTime: number,
  _metricName: 'api_response_ms' | 'api_error_duration',
  _status: number
): void {
  // 性能监控服务已移除
}
