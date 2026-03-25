import type {
  ContentPolicySnapshot,
  EdgeOptimization,
  GlobalEdgeMetrics,
} from './types.ts'

export const CORE_EDGE_COLOS = ['LAX', 'NRT', 'FRA', 'SIN', 'BOM'] as const

export function createDefaultGlobalMetrics(): GlobalEdgeMetrics {
  return {
    totalRequests: 0,
    averageLatency: 0,
    averageErrorRate: 0,
    averageCacheHitRate: 0,
    averageUserSatisfaction: 100,
    totalBandwidthUsage: 0,
    locations: 0,
  }
}

export function createEmptyContentPolicy(): ContentPolicySnapshot {
  return {
    cacheTtlByColo: {},
    compressionByColo: {},
    prefetchColos: [],
  }
}

export function createDefaultEdgeOptimizations(): EdgeOptimization[] {
  return [
    {
      type: 'latency',
      strategy: 'cdn',
      targetLocations: ['LAX', 'NRT', 'FRA', 'SIN'],
      optimizationParams: {
        enableArgoSmartRouting: true,
        enableTieredCaching: true,
        preloadCriticalResources: true,
      },
    },
    {
      type: 'bandwidth',
      strategy: 'streaming',
      targetLocations: ['global'],
      optimizationParams: {
        enableAdaptiveBitrate: true,
        enableEdgeCompression: true,
        optimizeForMobile: true,
      },
    },
    {
      type: 'content',
      strategy: 'cache',
      targetLocations: ['global'],
      optimizationParams: {
        enableEdgeCaching: true,
        cachePersonalization: true,
        predictivePrefetching: true,
      },
    },
    {
      type: 'computation',
      strategy: 'compute',
      targetLocations: [...CORE_EDGE_COLOS],
      optimizationParams: {
        enableEdgeComputing: true,
        distributeHeavyTasks: true,
        optimizeForLatency: true,
      },
    },
  ]
}
