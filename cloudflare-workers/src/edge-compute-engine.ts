/**
 * 边缘计算深化引擎
 * 充分利用Cloudflare全球边缘网络，实现高级边缘计算功能
 */

import {
  getHighLatencyLocations,
  logEdgeAnalyticsSummary,
  mergeContentPlanWithPrefetch,
  uniqueLocations,
} from './edge-compute/analytics.ts'
import {
  extractUserContext,
  getEdgeLocation,
} from './edge-compute/context.ts'
import {
  createDefaultGlobalMetrics,
} from './edge-compute/defaults.ts'
import {
  calculateGlobalMetrics,
} from './edge-compute/helpers.ts'
import {
  ContentDeliveryOptimizer,
  ComputeDistributionEngine,
  GeoIntelligenceEngine,
} from './edge-compute/optimizers.ts'
import {
  applyEdgeOptimizations,
} from './edge-compute/request-optimizer.ts'
import {
  optimizeEdgeResponse,
} from './edge-compute/response-optimizer.ts'
import {
  processOptimizedRequest,
} from './edge-compute/routing.ts'
import {
  EdgeAnalyticsRegistry,
  EdgeOptimizationRegistry,
  UserContextRegistry,
} from './edge-compute/state.ts'
import type {
  EdgeRequestDispatcher,
  GlobalEdgeMetrics,
  UserContext,
} from './edge-compute/types.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

export class EdgeComputeEngine {
  private static instance: EdgeComputeEngine
  private geoIntelligence = new GeoIntelligenceEngine()
  private contentDelivery = new ContentDeliveryOptimizer()
  private computeDistribution = new ComputeDistributionEngine()
  private userContexts = new UserContextRegistry(200)
  private edgeAnalytics = new EdgeAnalyticsRegistry(500, 30 * 60 * 1000)
  private optimizationRegistry = new EdgeOptimizationRegistry()
  private latestGlobalMetrics: GlobalEdgeMetrics = createDefaultGlobalMetrics()

  private constructor() {
    this.startEdgeAnalytics()
  }

  static getInstance(): EdgeComputeEngine {
    if (!EdgeComputeEngine.instance) {
      EdgeComputeEngine.instance = new EdgeComputeEngine()
    }
    return EdgeComputeEngine.instance
  }

  private startEdgeAnalytics(): void {
    setInterval(async () => {
      await this.collectEdgeAnalytics()
      await this.optimizeEdgeDistribution()
    }, 60000)
  }

  async processRequest(
    request: Request,
    env: EnhancedWorkerEnv,
    dispatcher?: EdgeRequestDispatcher
  ): Promise<Response> {
    const startedAt = Date.now()
    const userContext = extractUserContext(request)
    const edgeLocation = getEdgeLocation(request)

    this.userContexts.remember(userContext)

    const optimizedRequest = applyEdgeOptimizations(
      request,
      userContext,
      edgeLocation,
      this.optimizationRegistry.list()
    )
    const response = await processOptimizedRequest(
      optimizedRequest,
      env,
      userContext,
      dispatcher
    )
    const optimizedResponse = optimizeEdgeResponse(
      response,
      userContext,
      edgeLocation,
      this.optimizationRegistry.getContentPolicy()
    )
    this.edgeAnalytics.record(
      userContext,
      edgeLocation,
      optimizedRequest,
      optimizedResponse,
      Date.now() - startedAt
    )

    return optimizedResponse
  }

  private async collectEdgeAnalytics() {
    const globalAnalytics = this.edgeAnalytics.values()
    this.latestGlobalMetrics = calculateGlobalMetrics(globalAnalytics)

    const geoInsight = await this.geoIntelligence.analyzeUserPatterns(globalAnalytics)
    const loadInsight = await this.computeDistribution.optimizeLoad(globalAnalytics)

    logEdgeAnalyticsSummary(
      this.latestGlobalMetrics,
      geoInsight.hotspotColos,
      loadInsight.imbalanceScore
    )
  }

  private async optimizeEdgeDistribution() {
    const analytics = this.edgeAnalytics.values()
    if (analytics.length === 0) {
      return
    }

    const predictedDemand = await this.geoIntelligence.predictDemand(analytics)
    const geoInsight = await this.geoIntelligence.analyzeUserPatterns(analytics)
    const distribution = await this.computeDistribution.distributeTasks(predictedDemand, analytics)
    const contentPlan = await this.contentDelivery.optimizeContent(this.latestGlobalMetrics, analytics)
    const prefetchPlan = await this.contentDelivery.predictPrefetch(geoInsight.hotspotColos)
    const highLoadLocations = uniqueLocations(distribution.scaleUp)
    const lowLoadLocations = uniqueLocations(distribution.scaleDown)
    const highLatencyLocations = getHighLatencyLocations(analytics, this.latestGlobalMetrics)

    if (highLoadLocations.length > 0) {
      console.log('[Edge Optimizer] 扩展高负载地区:', highLoadLocations)
      await this.scaleEdgeResources(highLoadLocations, 'up')
    }

    if (lowLoadLocations.length > 0) {
      await this.scaleEdgeResources(lowLoadLocations, 'down')
    }

    if (highLatencyLocations.length > 0) {
      console.log('[Edge Optimizer] 优化高延迟地区:', highLatencyLocations)
      await this.optimizeLatencyForLocations(highLatencyLocations)
    }

    this.optimizationRegistry.applyContentPlan(
      mergeContentPlanWithPrefetch(contentPlan, prefetchPlan)
    )
  }

  private async scaleEdgeResources(locations: string[], direction: 'up' | 'down') {
    console.log(`[Edge Optimizer] ${direction === 'up' ? '扩展' : '缩减'}资源:`, locations)
    this.optimizationRegistry.scaleResources(locations, direction)
  }

  private async optimizeLatencyForLocations(locations: string[]) {
    console.log('[Edge Optimizer] 优化延迟:', Array.from(new Set(locations)))
    this.optimizationRegistry.optimizeLatencyForLocations(locations)
  }

  // 公共API
  getUserContexts(): Map<string, UserContext> {
    return this.userContexts.snapshot()
  }

  getEdgeAnalytics() {
    return this.edgeAnalytics.snapshot()
  }

  getOptimizations() {
    return this.optimizationRegistry.list()
  }

  addOptimization(optimization: ReturnType<EdgeOptimizationRegistry['list']>[number]) {
    this.optimizationRegistry.add(optimization)
  }

  removeOptimization(type: string) {
    this.optimizationRegistry.remove(type)
  }

  getGlobalAnalytics(): {
    totalRequests: number
    averageLatency: number
    errorRate: number
    locations: number
  } {
    const analytics = this.edgeAnalytics.getMetrics()
    return {
      totalRequests: analytics.totalRequests,
      averageLatency: analytics.averageLatency,
      errorRate: analytics.averageErrorRate,
      locations: analytics.locations
    }
  }
}

// 导出单例实例
export const edgeComputeEngine = EdgeComputeEngine.getInstance()
