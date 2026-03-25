import type {
  ContentOptimizationPlan,
  EdgeAnalytics,
  GlobalEdgeMetrics,
} from './types.ts'

export class GeoIntelligenceEngine {
  async analyzeUserPatterns(analytics: EdgeAnalytics[]): Promise<{
    hotspotColos: string[]
    topContinents: Array<{ continent: string; requests: number }>
  }> {
    const continentRequests = new Map<string, number>()
    const coloRequests = new Map<string, number>()

    for (const item of analytics) {
      continentRequests.set(
        item.location.continent,
        (continentRequests.get(item.location.continent) || 0) + item.requestCount
      )
      coloRequests.set(
        item.location.colo,
        (coloRequests.get(item.location.colo) || 0) + item.requestCount
      )
    }

    const topContinents = Array.from(continentRequests.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([continent, requests]) => ({ continent, requests }))

    const hotspotColos = Array.from(coloRequests.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([colo]) => colo)

    return { hotspotColos, topContinents }
  }

  async predictDemand(analytics: EdgeAnalytics[]): Promise<Record<string, number>> {
    const forecast: Record<string, number> = {}
    for (const item of analytics) {
      const demand = item.requestCount * (1 + item.errorRate) * (item.averageLatency > 300 ? 1.1 : 1)
      forecast[item.location.colo] = Math.round(demand)
    }
    return forecast
  }
}

export class ContentDeliveryOptimizer {
  async optimizeContent(
    globalMetrics: GlobalEdgeMetrics,
    analytics: EdgeAnalytics[]
  ): Promise<ContentOptimizationPlan> {
    const cacheTtlByColo: Record<string, number> = {}
    const compressionByColo: Record<string, 'aggressive' | 'balanced'> = {}
    const prefetchColos: string[] = []

    for (const item of analytics) {
      const colo = item.location.colo
      const highLatency = item.averageLatency > Math.max(300, globalMetrics.averageLatency * 1.2)
      const highError = item.errorRate > Math.max(0.05, globalMetrics.averageErrorRate * 1.2)
      cacheTtlByColo[colo] = highError ? 180 : 600
      compressionByColo[colo] = highLatency ? 'aggressive' : 'balanced'
      if (item.requestCount > 100 || item.cacheHitRate < 0.4) {
        prefetchColos.push(colo)
      }
    }

    return {
      cacheTtlByColo,
      compressionByColo,
      prefetchColos: Array.from(new Set(prefetchColos)),
    }
  }

  async predictPrefetch(hotspotColos: string[]): Promise<Record<string, string[]>> {
    const defaults = ['/api/search', '/api/discovery', '/api/content']
    const result: Record<string, string[]> = {}
    for (const colo of hotspotColos) {
      result[colo] = defaults
    }
    return result
  }
}

export class ComputeDistributionEngine {
  async distributeTasks(
    predictedDemand: Record<string, number>,
    analytics: EdgeAnalytics[]
  ): Promise<{ scaleUp: string[]; scaleDown: string[] }> {
    const requests = analytics.map(item => item.requestCount)
    const averageRequests = requests.length
      ? requests.reduce((sum, value) => sum + value, 0) / requests.length
      : 0
    const upperThreshold = Math.max(100, averageRequests * 1.5)
    const lowerThreshold = averageRequests * 0.4

    const scaleUp: string[] = []
    const scaleDown: string[] = []

    for (const item of analytics) {
      const colo = item.location.colo
      const demand = predictedDemand[colo] || item.requestCount
      if (demand >= upperThreshold) scaleUp.push(colo)
      if (demand <= lowerThreshold) scaleDown.push(colo)
    }

    return {
      scaleUp: Array.from(new Set(scaleUp)),
      scaleDown: Array.from(new Set(scaleDown)),
    }
  }

  async optimizeLoad(
    analytics: EdgeAnalytics[]
  ): Promise<{ imbalanceScore: number; overloaded: string[]; underutilized: string[] }> {
    if (analytics.length === 0) {
      return { imbalanceScore: 0, overloaded: [], underutilized: [] }
    }

    const requests = analytics.map(item => item.requestCount)
    const max = Math.max(...requests)
    const min = Math.min(...requests)
    const imbalanceScore = max === 0 ? 0 : Number(((max - min) / max).toFixed(2))
    const avg = requests.reduce((sum, value) => sum + value, 0) / requests.length

    const overloaded = analytics
      .filter(item => item.requestCount > avg * 1.5)
      .map(item => item.location.colo)
    const underutilized = analytics
      .filter(item => item.requestCount < avg * 0.4)
      .map(item => item.location.colo)

    return {
      imbalanceScore,
      overloaded: Array.from(new Set(overloaded)),
      underutilized: Array.from(new Set(underutilized)),
    }
  }
}
