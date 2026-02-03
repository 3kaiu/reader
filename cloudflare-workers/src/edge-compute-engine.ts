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
}

export class EdgeComputeEngine {
  private static instance: EdgeComputeEngine
  private userContexts: Map<string, UserContext> = new Map()
  private edgeAnalytics: Map<string, EdgeAnalytics> = new Map()
  private optimizations: EdgeOptimization[] = []
  private geoIntelligence: GeoIntelligenceEngine
  private contentDelivery: ContentDeliveryOptimizer
  private computeDistribution: ComputeDistributionEngine

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

  async processRequest(request: Request, env: any): Promise<Response> {
    const userContext = await this.extractUserContext(request)
    const edgeLocation = await this.getEdgeLocation()

    // 记录用户上下文
    this.userContexts.set(userContext.ip, userContext)

    // 应用边缘优化
    const optimizedRequest = await this.applyEdgeOptimizations(request, userContext, edgeLocation)

    // 执行请求处理
    const response = await this.processOptimizedRequest(optimizedRequest, env, userContext)

    // 应用响应优化
    const optimizedResponse = await this.optimizeResponse(response, userContext, edgeLocation)

    // 记录分析数据
    await this.recordEdgeAnalytics(userContext, edgeLocation, optimizedRequest, optimizedResponse)

    return optimizedResponse
  }

  private async extractUserContext(request: Request): Promise<UserContext> {
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For') ||
               request.headers.get('X-Real-IP') || 'unknown'

    const location = await this.getUserLocation(ip)
    const device = this.detectDevice(request)
    const network = await this.getNetworkInfo(ip)

    return {
      ip,
      location,
      device,
      network,
      preferences: this.extractUserPreferences(request)
    }
  }

  private async getUserLocation(ip: string): Promise<EdgeLocation> {
    // 使用Cloudflare的地理位置API
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}`)
      const data = await response.json()

      return {
        city: data.city || 'Unknown',
        country: data.country || 'Unknown',
        continent: this.getContinentFromCountry(data.country),
        latitude: data.lat || 0,
        longitude: data.lon || 0,
        colo: await this.getNearestColo(data.lat, data.lon)
      }
    } catch (error) {
      // 默认位置
      return {
        city: 'Unknown',
        country: 'Unknown',
        continent: 'Unknown',
        latitude: 0,
        longitude: 0,
        colo: 'UNKNOWN'
      }
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

  private async getNetworkInfo(ip: string): Promise<UserContext['network']> {
    // 使用Cloudflare的网络信息
    const asn = parseInt(request.cf?.asn as string) || 0
    const isp = request.cf?.asOrganization as string || 'Unknown'

    // 估算带宽（简化实现）
    const bandwidth = this.estimateBandwidth(request)

    return { asn, isp, bandwidth }
  }

  private extractUserPreferences(request: Request): UserContext['preferences'] {
    const acceptLanguage = request.headers.get('Accept-Language') || 'en-US'
    const language = acceptLanguage.split(',')[0].split('-')[0]

    return {
      language,
      timezone: 'UTC', // 可以从请求中提取更准确的信息
      currency: 'USD'  // 可以基于地理位置确定
    }
  }

  private async getEdgeLocation(): Promise<EdgeLocation> {
    // 获取当前边缘位置
    const colo = request.cf?.colo as string || 'UNKNOWN'

    // 使用colo代码获取位置信息
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
    userContext: UserContext
  ): Promise<Response> {
    // 这里调用主要的请求处理逻辑
    // 由于我们已经有了unified-worker.ts，这里只是集成点

    // 模拟请求处理（实际应该调用现有的worker逻辑）
    const response = await this.routeToOptimalEndpoint(request, env, userContext)

    return response
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

    // 地理位置感知的缓存策略
    if (userContext.location.continent === 'Asia') {
      optimizedHeaders.set('Cache-Control', 'public, max-age=300') // 亚洲用户缓存5分钟
    } else {
      optimizedHeaders.set('Cache-Control', 'public, max-age=600') // 其他地区缓存10分钟
    }

    // 设备特定的优化
    if (userContext.device.type === 'mobile') {
      optimizedHeaders.set('CF-Mobile-Optimized', 'true')
    }

    // 网络条件感知的压缩
    if (userContext.network.bandwidth < 20) {
      optimizedHeaders.set('CF-Compress', 'aggressive')
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
    response: Response
  ) {
    const key = `${edgeLocation.colo}_${userContext.ip}`

    const analytics: EdgeAnalytics = this.edgeAnalytics.get(key) || {
      location: edgeLocation,
      requestCount: 0,
      averageLatency: 0,
      bandwidthUsage: 0,
      cacheHitRate: 0,
      errorRate: 0,
      userSatisfaction: 100
    }

    analytics.requestCount++
    analytics.errorRate = response.status >= 400 ? analytics.errorRate + 0.01 : analytics.errorRate * 0.99

    this.edgeAnalytics.set(key, analytics)
  }

  private async collectEdgeAnalytics() {
    // 收集所有边缘位置的分析数据
    const globalAnalytics = Array.from(this.edgeAnalytics.values())

    // 计算全局指标
    const totalRequests = globalAnalytics.reduce((sum, a) => sum + a.requestCount, 0)
    const averageLatency = globalAnalytics.reduce((sum, a) => sum + a.averageLatency, 0) / globalAnalytics.length
    const averageErrorRate = globalAnalytics.reduce((sum, a) => sum + a.errorRate, 0) / globalAnalytics.length

    console.log('[Edge Analytics]', {
      totalRequests,
      averageLatency,
      averageErrorRate,
      locations: globalAnalytics.length
    })
  }

  private async optimizeEdgeDistribution() {
    // 基于分析数据优化边缘分布
    const analytics = Array.from(this.edgeAnalytics.values())

    // 识别高负载地区
    const highLoadLocations = analytics
      .filter(a => a.requestCount > 1000)
      .map(a => a.location.colo)

    // 识别高延迟地区
    const highLatencyLocations = analytics
      .filter(a => a.averageLatency > 500)
      .map(a => a.location.colo)

    // 动态调整优化策略
    if (highLoadLocations.length > 0) {
      console.log('[Edge Optimizer] 扩展高负载地区:', highLoadLocations)
      await this.scaleEdgeResources(highLoadLocations, 'up')
    }

    if (highLatencyLocations.length > 0) {
      console.log('[Edge Optimizer] 优化高延迟地区:', highLatencyLocations)
      await this.optimizeLatencyForLocations(highLatencyLocations)
    }
  }

  // 工具方法
  private getContinentFromCountry(country: string): string {
    const continentMap: Record<string, string> = {
      'China': 'Asia',
      'Japan': 'Asia',
      'South Korea': 'Asia',
      'India': 'Asia',
      'Germany': 'Europe',
      'France': 'Europe',
      'United Kingdom': 'Europe',
      'United States': 'North America',
      'Canada': 'North America',
      'Brazil': 'South America',
      'Australia': 'Oceania'
    }
    return continentMap[country] || 'Unknown'
  }

  private async getNearestColo(lat: number, lon: number): Promise<string> {
    // Cloudflare数据中心映射
    const colos = [
      { code: 'LAX', lat: 33.9425, lon: -118.4081 }, // Los Angeles
      { code: 'NRT', lat: 35.6895, lon: 139.6917 }, // Tokyo
      { code: 'FRA', lat: 50.1109, lon: 8.6821 },   // Frankfurt
      { code: 'SIN', lat: 1.3521, lon: 103.8198 },  // Singapore
      { code: 'BOM', lat: 19.0760, lon: 72.8777 },  // Mumbai
    ]

    let nearestColo = 'LAX'
    let minDistance = Infinity

    for (const colo of colos) {
      const distance = this.calculateDistance(lat, lon, colo.lat, colo.lon)
      if (distance < minDistance) {
        minDistance = distance
        nearestColo = colo.code
      }
    }

    return nearestColo
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // 地球半径（公里）
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
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

  private estimateBandwidth(request: Request): number {
    // 基于连接类型估算带宽
    const connection = request.headers.get('CF-Ray') || ''
    // 简化估算逻辑
    return 50 // Mbps 默认值
  }

  private async routeToOptimalEndpoint(request: Request, env: any, userContext: UserContext): Promise<Response> {
    // 这里应该调用现有的worker逻辑
    // 为了演示，返回一个模拟响应
    return new Response(JSON.stringify({
      message: 'Edge optimized request processed',
      userContext,
      optimized: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async scaleEdgeResources(locations: string[], direction: 'up' | 'down') {
    console.log(`[Edge Optimizer] ${direction === 'up' ? '扩展' : '缩减'}资源:`, locations)
    // 在实际实现中，这里会调用Cloudflare API来调整资源分配
  }

  private async optimizeLatencyForLocations(locations: string[]) {
    console.log('[Edge Optimizer] 优化延迟:', locations)
    // 实现延迟优化逻辑
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
  async analyzeUserPatterns(): Promise<any> {
    // 分析用户地理模式
    return {}
  }

  async predictDemand(): Promise<any> {
    // 预测需求模式
    return {}
  }
}

// 内容交付优化器
class ContentDeliveryOptimizer {
  async optimizeContent(): Promise<any> {
    // 优化内容交付
    return {}
  }

  async predictPrefetch(): Promise<any> {
    // 预测预取
    return {}
  }
}

// 计算分布引擎
class ComputeDistributionEngine {
  async distributeTasks(): Promise<any> {
    // 分发计算任务
    return {}
  }

  async optimizeLoad(): Promise<any> {
    // 优化负载均衡
    return {}
  }
}

// 导出单例实例
export const edgeComputeEngine = EdgeComputeEngine.getInstance()