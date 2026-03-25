import type { EnhancedWorkerEnv } from '../../worker/types.ts'

export interface EdgeLocation {
  city: string
  country: string
  continent: string
  latitude: number
  longitude: number
  colo: string
}

export interface UserContext {
  ip: string
  location: EdgeLocation
  device: {
    type: 'mobile' | 'desktop' | 'tablet'
    os: string
    browser: string
  }
  network: {
    asn: number
    isp: string
    bandwidth: number
  }
  preferences: {
    language: string
    timezone: string
    currency: string
  }
}

export interface EdgeOptimization {
  type: 'latency' | 'bandwidth' | 'content' | 'computation'
  strategy: 'cdn' | 'compute' | 'cache' | 'streaming'
  targetLocations: string[]
  optimizationParams: Record<string, unknown>
}

export interface EdgeAnalytics {
  location: EdgeLocation
  requestCount: number
  averageLatency: number
  bandwidthUsage: number
  cacheHitRate: number
  errorRate: number
  userSatisfaction: number
  lastUpdated: number
}

export interface EdgeRequestDispatcher {
  dispatch(request: Request, env: EnhancedWorkerEnv, userContext: UserContext): Promise<Response>
}

export type CfContext = Record<string, unknown>
export type RequestWithCf = Request & { cf?: CfContext }
export type EdgeRouteEnv = Pick<EnhancedWorkerEnv, 'NEXUS_LITE_URL'> & { nexusLiteUrl?: string }

export interface GlobalEdgeMetrics {
  totalRequests: number
  averageLatency: number
  averageErrorRate: number
  averageCacheHitRate: number
  averageUserSatisfaction: number
  totalBandwidthUsage: number
  locations: number
}

export interface ContentOptimizationPlan {
  cacheTtlByColo: Record<string, number>
  compressionByColo: Record<string, 'aggressive' | 'balanced'>
  prefetchColos: string[]
}

export interface ContentPolicySnapshot {
  cacheTtlByColo: Record<string, number>
  compressionByColo: Record<string, 'aggressive' | 'balanced'>
  prefetchColos: string[]
}
