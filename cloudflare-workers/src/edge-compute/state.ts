import { CORE_EDGE_COLOS, createDefaultEdgeOptimizations, createEmptyContentPolicy } from './defaults.ts'
import { asNumber, calculateGlobalMetrics, calculateUserSatisfaction, getBandwidthBucket, updateMean } from './helpers.ts'
import type {
  ContentOptimizationPlan,
  ContentPolicySnapshot,
  EdgeAnalytics,
  EdgeLocation,
  EdgeOptimization,
  GlobalEdgeMetrics,
  UserContext,
} from './types.ts'

export class UserContextRegistry {
  private readonly entries = new Map<string, UserContext>()

  constructor(private readonly maxEntries: number) {}

  remember(context: UserContext): void {
    this.entries.set(context.ip, context)

    const overflow = this.entries.size - this.maxEntries
    if (overflow <= 0) return

    const keysToDelete = Array.from(this.entries.keys()).slice(0, overflow)
    for (const key of keysToDelete) {
      this.entries.delete(key)
    }
  }

  snapshot(): Map<string, UserContext> {
    return new Map(this.entries)
  }
}

export class EdgeOptimizationRegistry {
  private optimizations: EdgeOptimization[] = createDefaultEdgeOptimizations()
  private contentPolicy: ContentPolicySnapshot = createEmptyContentPolicy()

  list(): EdgeOptimization[] {
    return [...this.optimizations]
  }

  getContentPolicy(): ContentPolicySnapshot {
    return {
      cacheTtlByColo: { ...this.contentPolicy.cacheTtlByColo },
      compressionByColo: { ...this.contentPolicy.compressionByColo },
      prefetchColos: [...this.contentPolicy.prefetchColos],
    }
  }

  add(optimization: EdgeOptimization): void {
    this.optimizations.push(optimization)
  }

  remove(type: string): void {
    this.optimizations = this.optimizations.filter(opt => opt.type !== type)
  }

  scaleResources(locations: string[], direction: 'up' | 'down'): void {
    const locationSet = new Set(locations)
    const coreLocations = new Set<string>(CORE_EDGE_COLOS)

    this.optimizations = this.optimizations.map(opt => {
      if (opt.type !== 'computation' && opt.type !== 'latency') return opt
      const targets = new Set(opt.targetLocations)
      if (direction === 'up') {
        locationSet.forEach(loc => targets.add(loc))
      } else {
        locationSet.forEach(loc => {
          if (!coreLocations.has(loc)) targets.delete(loc)
        })
      }
      return { ...opt, targetLocations: Array.from(targets) }
    })
  }

  optimizeLatencyForLocations(locations: string[]): void {
    const locationSet = new Set(locations)

    this.optimizations = this.optimizations.map(opt => {
      if (opt.type === 'latency') {
        const targets = new Set(opt.targetLocations)
        locationSet.forEach(loc => targets.add(loc))
        return {
          ...opt,
          targetLocations: Array.from(targets),
          optimizationParams: {
            ...opt.optimizationParams,
            enableArgoSmartRouting: true,
            preferredColos: Array.from(locationSet),
          },
        }
      }
      if (opt.type === 'content') {
        return {
          ...opt,
          optimizationParams: {
            ...opt.optimizationParams,
            regionalCacheBoost: Array.from(locationSet),
          },
        }
      }
      return opt
    })
  }

  applyContentPlan(plan: ContentOptimizationPlan): void {
    this.contentPolicy = {
      cacheTtlByColo: { ...plan.cacheTtlByColo },
      compressionByColo: { ...plan.compressionByColo },
      prefetchColos: [...plan.prefetchColos],
    }

    this.optimizations = this.optimizations.map(opt => {
      if (opt.type !== 'content') return opt
      return {
        ...opt,
        optimizationParams: {
          ...opt.optimizationParams,
          cacheTtlByColo: plan.cacheTtlByColo,
          compressionByColo: plan.compressionByColo,
          prefetchColos: plan.prefetchColos,
        },
      }
    })
  }
}

export class EdgeAnalyticsRegistry {
  private readonly entries = new Map<string, EdgeAnalytics>()

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number
  ) {}

  record(
    userContext: UserContext,
    edgeLocation: EdgeLocation,
    request: Request,
    response: Response,
    latencyMs: number
  ): void {
    const key = this.getBucketKey(edgeLocation.colo, userContext)
    const now = Date.now()

    const analytics: EdgeAnalytics = this.entries.get(key) || {
      location: edgeLocation,
      requestCount: 0,
      averageLatency: 0,
      bandwidthUsage: 0,
      cacheHitRate: 0,
      errorRate: 0,
      userSatisfaction: 100,
      lastUpdated: now,
    }

    analytics.requestCount++
    const requestCount = analytics.requestCount
    const isError = response.status >= 400 ? 1 : 0
    const isCacheHit = (response.headers.get('CF-Cache-Status') || '').toUpperCase() === 'HIT' ? 1 : 0
    const payloadBytes = asNumber(response.headers.get('Content-Length'), 0)
    const routePath = new URL(request.url).pathname
    const routeWeight = routePath.startsWith('/api/content') ? 1.2 : 1

    analytics.averageLatency = updateMean(analytics.averageLatency, latencyMs, requestCount)
    analytics.errorRate = updateMean(analytics.errorRate, isError, requestCount)
    analytics.cacheHitRate = updateMean(analytics.cacheHitRate, isCacheHit, requestCount)
    analytics.bandwidthUsage += Math.max(0, payloadBytes) * routeWeight
    analytics.userSatisfaction = calculateUserSatisfaction(
      analytics.averageLatency,
      analytics.errorRate,
      analytics.cacheHitRate
    )
    analytics.lastUpdated = now

    this.entries.set(key, analytics)
    this.compact(now)
  }

  values(): EdgeAnalytics[] {
    return Array.from(this.entries.values())
  }

  snapshot(): Map<string, EdgeAnalytics> {
    return new Map(this.entries)
  }

  getMetrics(): GlobalEdgeMetrics {
    return calculateGlobalMetrics(this.values())
  }

  private getBucketKey(colo: string, userContext: UserContext): string {
    const bandwidthBucket = getBandwidthBucket(userContext.network.bandwidth)
    return `${colo}:${userContext.device.type}:${bandwidthBucket}`
  }

  private compact(now: number): void {
    for (const [key, value] of this.entries) {
      if (now - value.lastUpdated > this.ttlMs) {
        this.entries.delete(key)
      }
    }

    const overflow = this.entries.size - this.maxEntries
    if (overflow <= 0) return

    const sortedByFreshness = Array.from(this.entries.entries())
      .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated)
    for (let i = 0; i < overflow; i++) {
      const item = sortedByFreshness[i]
      if (item) this.entries.delete(item[0])
    }
  }
}
