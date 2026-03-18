/**
 * 边缘计算深化引擎
 * 充分利用Cloudflare全球边缘网络，实现高级边缘计算功能
 */

interface EdgeLocation {
  city: string
  country: string
  continent: string
  latitude: number
  longitude: number
  colo: string // Cloudflare数据中心代码
}

interface UserContext {
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
    bandwidth: number // Mbps
  }
  preferences: {
    language: string
    timezone: string
    currency: string
  }
}

interface EdgeOptimization {
  type: 'latency' | 'bandwidth' | 'content' | 'computation'
  strategy: 'cdn' | 'compute' | 'cache' | 'streaming'
  targetLocations: string[]
  optimizationParams: Record<string, any>
}

interface EdgeAnalytics {
  location: EdgeLocation
  requestCount: number
  averageLatency: number
  bandwidthUsage: number
  cacheHitRate: number
  errorRate: number
  userSatisfaction: number
  lastUpdated: number
}

interface EdgeRequestDispatcher {
  dispatch(request: Request, env: any, userContext: UserContext): Promise<Response>
}

type CfContext = Record<string, any>

interface GlobalEdgeMetrics {
  totalRequests: number
  averageLatency: number
  averageErrorRate: number
  averageCacheHitRate: number
  averageUserSatisfaction: number
  totalBandwidthUsage: number
  locations: number
}

interface ContentOptimizationPlan {
  cacheTtlByColo: Record<string, number>
  compressionByColo: Record<string, 'aggressive' | 'balanced'>
  prefetchColos: string[]
}

interface ContentPolicySnapshot {
  cacheTtlByColo: Record<string, number>
  compressionByColo: Record<string, 'aggressive' | 'balanced'>
  prefetchColos: string[]
}

export class EdgeComputeEngine {
  private static instance: EdgeComputeEngine
  private userContexts: Map<string, UserContext> = new Map()
  private edgeAnalytics: Map<string, EdgeAnalytics> = new Map()
  private optimizations: EdgeOptimization[] = []
  private geoIntelligence: GeoIntelligenceEngine
  private contentDelivery: ContentDeliveryOptimizer
  private computeDistribution: ComputeDistributionEngine
  private latestGlobalMetrics: GlobalEdgeMetrics = {
    totalRequests: 0,
    averageLatency: 0,
    averageErrorRate: 0,
    averageCacheHitRate: 0,
    averageUserSatisfaction: 100,
    totalBandwidthUsage: 0,
    locations: 0,
  }
  private contentPolicy: ContentPolicySnapshot = {
    cacheTtlByColo: {},
    compressionByColo: {},
    prefetchColos: [],
  }
  private readonly maxUserContexts = 200
  private readonly maxEdgeAnalytics = 500
  private readonly analyticsTtlMs = 30 * 60 * 1000

  private constructor() {
    this.geoIntelligence = new GeoIntelligenceEngine()
    this.contentDelivery = new ContentDeliveryOptimizer()
    this.computeDistribution = new ComputeDistributionEngine()
    this.initializeEdgeOptimizations()
    this.startEdgeAnalytics()
  }

  static getInstance(): EdgeComputeEngine {
    if (!EdgeComputeEngine.instance) {
      EdgeComputeEngine.instance = new EdgeComputeEngine()
    }
    return EdgeComputeEngine.instance
  }

  private initializeEdgeOptimizations() {
    this.optimizations = [
      {
        type: 'latency',
        strategy: 'cdn',
        targetLocations: ['LAX', 'NRT', 'FRA', 'SIN'],
        optimizationParams: {
          enableArgoSmartRouting: true,
          enableTieredCaching: true,
          preloadCriticalResources: true
        }
      },
      {
        type: 'bandwidth',
        strategy: 'streaming',
        targetLocations: ['global'],
        optimizationParams: {
          enableAdaptiveBitrate: true,
          enableEdgeCompression: true,
          optimizeForMobile: true
        }
      },
      {
        type: 'content',
        strategy: 'cache',
        targetLocations: ['global'],
        optimizationParams: {
          enableEdgeCaching: true,
          cachePersonalization: true,
          predictivePrefetching: true
        }
      },
      {
        type: 'computation',
        strategy: 'compute',
        targetLocations: ['LAX', 'NRT', 'FRA', 'SIN', 'BOM'],
        optimizationParams: {
          enableEdgeComputing: true,
          distributeHeavyTasks: true,
          optimizeForLatency: true
        }
      }
    ]
  }

  private startEdgeAnalytics() {
    // 每分钟收集边缘分析数据
    setInterval(async () => {
      await this.collectEdgeAnalytics()
      await this.optimizeEdgeDistribution()
    }, 60000)
  }

  async processRequest(
    request: Request,
    env: any,
    dispatcher?: EdgeRequestDispatcher
  ): Promise<Response> {
    const startedAt = Date.now()
    const userContext = await this.extractUserContext(request)
    const edgeLocation = await this.getEdgeLocation(request)

    // 记录用户上下文
    this.userContexts.set(userContext.ip, userContext)
    this.trimUserContexts()

    // 应用边缘优化
    const optimizedRequest = await this.applyEdgeOptimizations(request, userContext, edgeLocation)

    // 执行请求处理
    const response = await this.processOptimizedRequest(
      optimizedRequest,
      env,
      userContext,
      dispatcher
    )

    // 应用响应优化
    const optimizedResponse = await this.optimizeResponse(response, userContext, edgeLocation)

    // 记录分析数据
    await this.recordEdgeAnalytics(
      userContext,
      edgeLocation,
      optimizedRequest,
      optimizedResponse,
      Date.now() - startedAt
    )

    return optimizedResponse
  }

  private async extractUserContext(request: Request): Promise<UserContext> {
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For') ||
               request.headers.get('X-Real-IP') || 'unknown'

    const location = await this.getUserLocation(request)
    const device = this.detectDevice(request)
    const network = await this.getNetworkInfo(request)

    return {
      ip,
      location,
      device,
      network,
      preferences: this.extractUserPreferences(request)
    }
  }

  private async getUserLocation(request: Request): Promise<EdgeLocation> {
    // Use Cloudflare-native metadata from request.cf; avoid third-party IP APIs.
    const cf = this.getCfContext(request)
    const colo = this.asString(cf.colo, 'UNKNOWN')
    const coloFallback = this.getLocationFromColo(colo)
    const country = this.asString(cf.country, coloFallback.country)

    return {
      city: this.asString(cf.city, coloFallback.city),
      country,
      continent: this.resolveContinent(cf.continent, country, coloFallback.continent),
      latitude: this.asNumber(cf.latitude, coloFallback.latitude),
      longitude: this.asNumber(cf.longitude, coloFallback.longitude),
      colo,
    }
  }

  private detectDevice(request: Request): UserContext['device'] {
    const userAgent = request.headers.get('User-Agent') || ''

    // 检测设备类型
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
    const isTablet = /iPad|Android(?=.*\bMobile\b)|Tablet/i.test(userAgent)

    let deviceType: 'mobile' | 'desktop' | 'tablet' = 'desktop'
    if (isTablet) deviceType = 'tablet'
    else if (isMobile) deviceType = 'mobile'

    // 检测操作系统
    let os = 'Unknown'
    if (userAgent.includes('Windows')) os = 'Windows'
    else if (userAgent.includes('Mac')) os = 'macOS'
    else if (userAgent.includes('Linux')) os = 'Linux'
    else if (userAgent.includes('Android')) os = 'Android'
    else if (userAgent.includes('iOS')) os = 'iOS'

    // 检测浏览器
    let browser = 'Unknown'
    if (userAgent.includes('Chrome')) browser = 'Chrome'
    else if (userAgent.includes('Firefox')) browser = 'Firefox'
    else if (userAgent.includes('Safari')) browser = 'Safari'
    else if (userAgent.includes('Edge')) browser = 'Edge'

    return { type: deviceType, os, browser }
  }

  private async getNetworkInfo(request: Request): Promise<UserContext['network']> {
    const cf = this.getCfContext(request)
    const asn = this.asNumber(cf.asn, 0)
    const isp = this.asString(cf.asOrganization, 'Unknown')
    const bandwidth = this.estimateBandwidth(request, cf)

    return { asn, isp, bandwidth }
  }

  private extractUserPreferences(request: Request): UserContext['preferences'] {
    const cf = this.getCfContext(request)
    const acceptLanguage = request.headers.get('Accept-Language') || 'en-US'
    const language = acceptLanguage.split(',')[0].split('-')[0]
    const timezone = this.asString(cf.timezone, 'UTC')
    const currency = this.getCurrencyForCountry(this.asString(cf.country, ''))

    return {
      language,
      timezone,
      currency
    }
  }

  private async getEdgeLocation(request: Request): Promise<EdgeLocation> {
    const cf = this.getCfContext(request)
    const colo = this.asString(cf.colo, 'UNKNOWN')

    return this.getLocationFromColo(colo)
  }

  private async applyEdgeOptimizations(
    request: Request,
    userContext: UserContext,
    edgeLocation: EdgeLocation
  ): Promise<Request> {
    let optimizedRequest = request

    for (const optimization of this.optimizations) {
      if (optimization.targetLocations.includes(edgeLocation.colo) ||
          optimization.targetLocations.includes('global')) {

        switch (optimization.type) {
          case 'latency':
            optimizedRequest = await this.optimizeForLatency(optimizedRequest, userContext)
            break
          case 'bandwidth':
            optimizedRequest = await this.optimizeForBandwidth(optimizedRequest, userContext)
            break
          case 'content':
            optimizedRequest = await this.optimizeContentDelivery(optimizedRequest, userContext)
            break
          case 'computation':
            optimizedRequest = await this.optimizeComputation(optimizedRequest, userContext)
            break
        }
      }
    }

    return optimizedRequest
  }

  private async optimizeForLatency(request: Request, userContext: UserContext): Promise<Request> {
    // 延迟优化：预加载、缓存预热、智能路由
    const url = new URL(request.url)

    // 为移动设备优化
    if (userContext.device.type === 'mobile') {
      // 减少不必要的资源
      url.searchParams.set('mobile', 'true')
    }

    // 基于地理位置的优化
    if (userContext.location.continent === 'Asia') {
      // 亚洲用户优化
      url.searchParams.set('region', 'asia')
    }

    return new Request(url.toString(), request)
  }

  private async optimizeForBandwidth(request: Request, userContext: UserContext): Promise<Request> {
    // 带宽优化：压缩、流媒体、自适应比特率
    const url = new URL(request.url)

    // 检测低带宽连接
    if (userContext.network.bandwidth < 10) {
      url.searchParams.set('low_bandwidth', 'true')
    }

    // 移动设备优化
    if (userContext.device.type === 'mobile') {
      url.searchParams.set('mobile_optimized', 'true')
    }

    return new Request(url.toString(), request)
  }

  private async optimizeContentDelivery(request: Request, userContext: UserContext): Promise<Request> {
    // 内容交付优化：边缘缓存、个性化内容、预测预取
    const url = new URL(request.url)

    // 添加用户偏好参数
    url.searchParams.set('lang', userContext.preferences.language)
    url.searchParams.set('device', userContext.device.type)

    // 地理位置感知内容
    url.searchParams.set('region', userContext.location.country.toLowerCase())

    return new Request(url.toString(), request)
  }

  private async optimizeComputation(request: Request, userContext: UserContext): Promise<Request> {
    // 计算优化：边缘计算、任务分发、负载均衡
    const url = new URL(request.url)

    // 基于边缘位置的计算优化
    url.searchParams.set('colo', request.cf?.colo as string || 'UNKNOWN')

    // 用户上下文感知计算
    url.searchParams.set('compute_priority',
      userContext.network.bandwidth > 50 ? 'high' : 'normal')

    return new Request(url.toString(), request)
  }

  private async processOptimizedRequest(
    request: Request,
    env: any,
    userContext: UserContext,
    dispatcher?: EdgeRequestDispatcher
  ): Promise<Response> {
    // src/* 是实验能力层；运行期路由由调用方显式注入，避免隐式耦合到某个入口文件。
    if (dispatcher) {
      return dispatcher.dispatch(request, env, userContext)
    }
    return this.routeToOptimalEndpoint(request, env)
  }

  private async optimizeResponse(
    response: Response,
    userContext: UserContext,
    edgeLocation: EdgeLocation
  ): Promise<Response> {
    // 响应优化：压缩、缓存头、个性化内容

    const optimizedHeaders = new Headers(response.headers)

    // 添加边缘缓存头
    optimizedHeaders.set('CF-Cache-Status', 'HIT')
    optimizedHeaders.set('CF-Edge-Location', edgeLocation.colo)

    const ttlFromPolicy = this.contentPolicy.cacheTtlByColo[edgeLocation.colo]
    const ttlByRegion = userContext.location.continent === 'Asia' ? 300 : 600
    const cacheTtl = this.asNumber(ttlFromPolicy, ttlByRegion)
    optimizedHeaders.set('Cache-Control', `public, max-age=${Math.max(60, cacheTtl)}`)

    // 设备特定的优化
    if (userContext.device.type === 'mobile') {
      optimizedHeaders.set('CF-Mobile-Optimized', 'true')
    }

    const compressionFromPolicy = this.contentPolicy.compressionByColo[edgeLocation.colo]
    if (compressionFromPolicy) {
      optimizedHeaders.set('CF-Compress', compressionFromPolicy)
    } else if (userContext.network.bandwidth < 20) {
      optimizedHeaders.set('CF-Compress', 'aggressive')
    } else {
      optimizedHeaders.set('CF-Compress', 'balanced')
    }

    if (this.contentPolicy.prefetchColos.includes(edgeLocation.colo)) {
      optimizedHeaders.set('CF-Edge-Prefetch', 'enabled')
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: optimizedHeaders
    })
  }

  private async recordEdgeAnalytics(
    userContext: UserContext,
    edgeLocation: EdgeLocation,
    request: Request,
    response: Response,
    latencyMs: number
  ) {
    const key = this.getAnalyticsBucketKey(edgeLocation.colo, userContext)
    const now = Date.now()

    const analytics: EdgeAnalytics = this.edgeAnalytics.get(key) || {
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
    const payloadBytes = this.asNumber(response.headers.get('Content-Length'), 0)
    const routePath = new URL(request.url).pathname
    const routeWeight = routePath.startsWith('/api/content') ? 1.2 : 1

    analytics.averageLatency = this.updateMean(analytics.averageLatency, latencyMs, requestCount)
    analytics.errorRate = this.updateMean(analytics.errorRate, isError, requestCount)
    analytics.cacheHitRate = this.updateMean(analytics.cacheHitRate, isCacheHit, requestCount)
    analytics.bandwidthUsage += Math.max(0, payloadBytes) * routeWeight
    analytics.userSatisfaction = this.calculateUserSatisfaction(
      analytics.averageLatency,
      analytics.errorRate,
      analytics.cacheHitRate
    )
    analytics.lastUpdated = now

    this.edgeAnalytics.set(key, analytics)
    this.compactEdgeAnalytics(now)
  }

  private async collectEdgeAnalytics() {
    // 收集所有边缘位置的分析数据
    const globalAnalytics = Array.from(this.edgeAnalytics.values())
    this.latestGlobalMetrics = this.calculateGlobalMetrics(globalAnalytics)

    const geoInsight = await this.geoIntelligence.analyzeUserPatterns(globalAnalytics)
    const loadInsight = await this.computeDistribution.optimizeLoad(globalAnalytics)

    console.log('[Edge Analytics]', {
      ...this.latestGlobalMetrics,
      hotspots: geoInsight.hotspotColos.slice(0, 3),
      imbalanceScore: loadInsight.imbalanceScore
    })
  }

  private async optimizeEdgeDistribution() {
    // 基于分析数据优化边缘分布
    const analytics = Array.from(this.edgeAnalytics.values())
    if (analytics.length === 0) return

    const predictedDemand = await this.geoIntelligence.predictDemand(analytics)
    const geoInsight = await this.geoIntelligence.analyzeUserPatterns(analytics)
    const distribution = await this.computeDistribution.distributeTasks(predictedDemand, analytics)
    const contentPlan = await this.contentDelivery.optimizeContent(this.latestGlobalMetrics, analytics)
    const prefetchPlan = await this.contentDelivery.predictPrefetch(geoInsight.hotspotColos)

    // 识别高负载地区
    const highLoadLocations = [...new Set(distribution.scaleUp)]
    const lowLoadLocations = [...new Set(distribution.scaleDown)]

    // 识别高延迟地区
    const highLatencyLocations = analytics
      .filter(a => a.averageLatency > Math.max(350, this.latestGlobalMetrics.averageLatency * 1.3))
      .map(a => a.location.colo)

    // 动态调整优化策略
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

    this.applyContentPlan({
      ...contentPlan,
      prefetchColos: Array.from(new Set([
        ...contentPlan.prefetchColos,
        ...Object.keys(prefetchPlan),
      ])),
    })
  }

  private getLocationFromColo(colo: string): EdgeLocation {
    const coloMap: Record<string, EdgeLocation> = {
      'LAX': { city: 'Los Angeles', country: 'United States', continent: 'North America', latitude: 33.9425, longitude: -118.4081, colo: 'LAX' },
      'NRT': { city: 'Tokyo', country: 'Japan', continent: 'Asia', latitude: 35.6895, longitude: 139.6917, colo: 'NRT' },
      'FRA': { city: 'Frankfurt', country: 'Germany', continent: 'Europe', latitude: 50.1109, longitude: 8.6821, colo: 'FRA' },
      'SIN': { city: 'Singapore', country: 'Singapore', continent: 'Asia', latitude: 1.3521, longitude: 103.8198, colo: 'SIN' },
      'BOM': { city: 'Mumbai', country: 'India', continent: 'Asia', latitude: 19.0760, longitude: 72.8777, colo: 'BOM' }
    }
    return coloMap[colo] || { city: 'Unknown', country: 'Unknown', continent: 'Unknown', latitude: 0, longitude: 0, colo }
  }

  private getCfContext(request: Request): CfContext {
    return ((request as any).cf || {}) as CfContext
  }

  private asString(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
    return fallback
  }

  private asNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return fallback
  }

  private resolveContinent(continent: unknown, country: string, fallback: string): string {
    const direct = this.asString(continent, '')
    if (direct) return direct

    const code = country.toUpperCase()
    const byCountryCode: Record<string, string> = {
      CN: 'Asia',
      JP: 'Asia',
      KR: 'Asia',
      SG: 'Asia',
      IN: 'Asia',
      DE: 'Europe',
      FR: 'Europe',
      GB: 'Europe',
      US: 'North America',
      CA: 'North America',
      BR: 'South America',
      AU: 'Oceania',
    }
    return byCountryCode[code] || fallback
  }

  private getCurrencyForCountry(country: string): string {
    const code = country.toUpperCase()
    const currencies: Record<string, string> = {
      CN: 'CNY',
      JP: 'JPY',
      KR: 'KRW',
      SG: 'SGD',
      IN: 'INR',
      DE: 'EUR',
      FR: 'EUR',
      GB: 'GBP',
      US: 'USD',
      CA: 'CAD',
      BR: 'BRL',
      AU: 'AUD',
    }
    return currencies[code] || 'USD'
  }

  private estimateBandwidth(request: Request, cf: CfContext): number {
    const downlink = this.asNumber(request.headers.get('Downlink'), 0)
    if (downlink > 0) return downlink

    const ect = (request.headers.get('ECT') || '').toLowerCase()
    const byEct: Record<string, number> = {
      'slow-2g': 0.15,
      '2g': 0.5,
      '3g': 1.6,
      '4g': 12,
    }
    if (byEct[ect]) return byEct[ect]

    const proto = this.asString(cf.httpProtocol, '').toUpperCase()
    let baseline = 8
    if (proto.includes('H3')) baseline = 25
    else if (proto.includes('H2')) baseline = 15

    const saveData = (request.headers.get('Save-Data') || '').toLowerCase() === 'on'
    return saveData ? Math.max(1, baseline / 2) : baseline
  }

  private updateMean(previous: number, sample: number, count: number): number {
    const safeCount = Math.max(1, count)
    return previous + (sample - previous) / safeCount
  }

  private calculateUserSatisfaction(latency: number, errorRate: number, cacheHitRate: number): number {
    const latencyPenalty = Math.min(40, latency / 40)
    const errorPenalty = Math.min(50, errorRate * 100)
    const cacheBonus = Math.min(10, cacheHitRate * 10)
    const score = 100 - latencyPenalty - errorPenalty + cacheBonus
    return Math.max(0, Math.min(100, Number(score.toFixed(2))))
  }

  private calculateGlobalMetrics(analytics: EdgeAnalytics[]): GlobalEdgeMetrics {
    if (analytics.length === 0) {
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

    const locations = analytics.length
    return {
      totalRequests: analytics.reduce((sum, item) => sum + item.requestCount, 0),
      averageLatency: analytics.reduce((sum, item) => sum + item.averageLatency, 0) / locations,
      averageErrorRate: analytics.reduce((sum, item) => sum + item.errorRate, 0) / locations,
      averageCacheHitRate: analytics.reduce((sum, item) => sum + item.cacheHitRate, 0) / locations,
      averageUserSatisfaction: analytics.reduce((sum, item) => sum + item.userSatisfaction, 0) / locations,
      totalBandwidthUsage: analytics.reduce((sum, item) => sum + item.bandwidthUsage, 0),
      locations,
    }
  }

  private async routeToOptimalEndpoint(request: Request, env: any): Promise<Response> {
    const targetUrl = env.NEXUS_LITE_URL || env.nexusLiteUrl
    if (!targetUrl) {
      return new Response(JSON.stringify({
        code: 'MISSING_DISPATCHER',
        message: 'EdgeComputeEngine requires a dispatcher or NEXUS_LITE_URL',
      }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const sourceUrl = new URL(request.url)
    const target = new URL(sourceUrl.pathname + sourceUrl.search, targetUrl)
    const headers = new Headers(request.headers)
    headers.delete('host')

    return fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.clone().text()
        : null,
    })
  }

  private async scaleEdgeResources(locations: string[], direction: 'up' | 'down') {
    console.log(`[Edge Optimizer] ${direction === 'up' ? '扩展' : '缩减'}资源:`, locations)
    const locationSet = new Set(locations)
    const coreLocations = new Set(['LAX', 'NRT', 'FRA', 'SIN', 'BOM'])

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

  private async optimizeLatencyForLocations(locations: string[]) {
    const locationSet = new Set(locations)
    console.log('[Edge Optimizer] 优化延迟:', Array.from(locationSet))

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

  private applyContentPlan(plan: ContentOptimizationPlan) {
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

  private getAnalyticsBucketKey(colo: string, userContext: UserContext): string {
    const bandwidthBucket = this.getBandwidthBucket(userContext.network.bandwidth)
    return `${colo}:${userContext.device.type}:${bandwidthBucket}`
  }

  private getBandwidthBucket(bandwidth: number): 'low' | 'medium' | 'high' {
    if (bandwidth < 5) return 'low'
    if (bandwidth < 20) return 'medium'
    return 'high'
  }

  private trimUserContexts() {
    const overflow = this.userContexts.size - this.maxUserContexts
    if (overflow <= 0) return

    const keysToDelete = Array.from(this.userContexts.keys()).slice(0, overflow)
    for (const key of keysToDelete) {
      this.userContexts.delete(key)
    }
  }

  private compactEdgeAnalytics(now: number) {
    for (const [key, value] of this.edgeAnalytics) {
      if (now - value.lastUpdated > this.analyticsTtlMs) {
        this.edgeAnalytics.delete(key)
      }
    }

    const overflow = this.edgeAnalytics.size - this.maxEdgeAnalytics
    if (overflow <= 0) return

    const sortedByFreshness = Array.from(this.edgeAnalytics.entries())
      .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated)
    for (let i = 0; i < overflow; i++) {
      const item = sortedByFreshness[i]
      if (item) this.edgeAnalytics.delete(item[0])
    }
  }

  // 公共API
  getUserContexts(): Map<string, UserContext> {
    return new Map(this.userContexts)
  }

  getEdgeAnalytics(): Map<string, EdgeAnalytics> {
    return new Map(this.edgeAnalytics)
  }

  getOptimizations(): EdgeOptimization[] {
    return [...this.optimizations]
  }

  addOptimization(optimization: EdgeOptimization) {
    this.optimizations.push(optimization)
  }

  removeOptimization(type: string) {
    this.optimizations = this.optimizations.filter(opt => opt.type !== type)
  }

  getGlobalAnalytics(): {
    totalRequests: number
    averageLatency: number
    errorRate: number
    locations: number
  } {
    const analytics = Array.from(this.edgeAnalytics.values())
    return {
      totalRequests: analytics.reduce((sum, a) => sum + a.requestCount, 0),
      averageLatency: analytics.reduce((sum, a) => sum + a.averageLatency, 0) / analytics.length || 0,
      errorRate: analytics.reduce((sum, a) => sum + a.errorRate, 0) / analytics.length || 0,
      locations: analytics.length
    }
  }
}

// 地理智能引擎
class GeoIntelligenceEngine {
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

// 内容交付优化器
class ContentDeliveryOptimizer {
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

// 计算分布引擎
class ComputeDistributionEngine {
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

// 导出单例实例
export const edgeComputeEngine = EdgeComputeEngine.getInstance()
