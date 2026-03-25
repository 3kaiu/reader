import type {
  FunctionOptimization,
  FunctionOptimizationType,
  ServerlessBottleneck,
  ServerlessMetrics,
} from './types.ts'

const OPTIMIZATION_TYPE_BY_BOTTLENECK: Record<ServerlessBottleneck, FunctionOptimizationType | null> = {
  cold_start: 'bundling',
  memory_pressure: 'memory',
  cpu_pressure: 'computation',
  network_latency: 'network',
  high_error_rate: null,
  low_cache_hit_rate: 'caching',
}

export function recommendOptimizations(
  bottlenecks: ServerlessBottleneck[],
  optimizations: FunctionOptimization[]
): FunctionOptimization[] {
  const selected = new Map<string, FunctionOptimization>()

  for (const bottleneck of bottlenecks) {
    const optimizationType = OPTIMIZATION_TYPE_BY_BOTTLENECK[bottleneck]
    if (!optimizationType) continue

    const optimization = optimizations.find(opt => opt.optimizationType === optimizationType)
    if (optimization) {
      selected.set(optimization.functionName, optimization)
    }
  }

  return Array.from(selected.values())
}

export function trimMetricsHistory(
  metrics: ServerlessMetrics[],
  limit: number
): ServerlessMetrics[] {
  if (metrics.length <= limit) {
    return metrics
  }
  return metrics.slice(-limit)
}

export function getLatestMetric(metrics: ServerlessMetrics[]): ServerlessMetrics | null {
  return metrics[metrics.length - 1] || null
}

export function buildOptimizationStatus(
  optimizations: FunctionOptimization[],
  tasks: Map<string, Promise<void>>
): Record<string, boolean> {
  const status: Record<string, boolean> = {}
  for (const optimization of optimizations) {
    status[optimization.functionName] = tasks.has(optimization.functionName)
  }
  return status
}
