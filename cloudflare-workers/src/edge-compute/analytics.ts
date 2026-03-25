import type {
  ContentOptimizationPlan,
  EdgeAnalytics,
  GlobalEdgeMetrics,
} from './types.ts'

export function logEdgeAnalyticsSummary(
  metrics: GlobalEdgeMetrics,
  hotspotColos: string[],
  imbalanceScore: number
): void {
  console.log('[Edge Analytics]', {
    ...metrics,
    hotspots: hotspotColos.slice(0, 3),
    imbalanceScore,
  })
}

export function getHighLatencyLocations(
  analytics: EdgeAnalytics[],
  metrics: GlobalEdgeMetrics
): string[] {
  return uniqueLocations(
    analytics
      .filter(item => item.averageLatency > Math.max(350, metrics.averageLatency * 1.3))
      .map(item => item.location.colo)
  )
}

export function mergeContentPlanWithPrefetch(
  contentPlan: ContentOptimizationPlan,
  prefetchPlan: Record<string, string[]>
): ContentOptimizationPlan {
  return {
    ...contentPlan,
    prefetchColos: uniqueLocations([
      ...contentPlan.prefetchColos,
      ...Object.keys(prefetchPlan),
    ]),
  }
}

export function uniqueLocations(locations: string[]): string[] {
  return Array.from(new Set(locations))
}
