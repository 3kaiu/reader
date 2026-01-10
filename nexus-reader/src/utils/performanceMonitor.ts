/**
 * Performance Monitor - 性能监控系统
 * 负责收集、存储和分析应用性能指标
 * 增强版：支持AI加载性能监控
 */

// 性能指标接口
export interface PerformanceMetrics {
  // Core Web Vitals
  lcp: number | null  // Largest Contentful Paint
  fid: number | null  // First Input Delay
  cls: number | null  // Cumulative Layout Shift
  
  // 自定义指标
  memoryUsage: number
  bundleSize: number
  loadTime: number
  apiResponseTime: number
  
  // AI性能指标
  aiLibraryLoadTime: number | null
  modelLoadTime: number | null
  inferenceTime: number | null
  ttsLoadTime: number | null
  cacheHitRate: number | null
  
  // 上下文信息
  timestamp: number
  userAgent: string
  networkType: string
  route: string
}

// AI性能指标接口
export interface AIPerformanceMetrics {
  // 库加载性能
  libraryLoadTime: number
  librarySize: number
  librarySource: 'cdn' | 'cache' | 'fallback'
  
  // 模型加载性能
  modelId: string
  modelLoadTime: number
  modelSize: number
  modelSource: 'download' | 'cache'
  downloadSpeed: number | null
  
  // 推理性能
  inferenceTime: number
  tokensPerSecond: number
  totalTokens: number
  memoryUsage: number
  
  // TTS性能
  ttsEngineLoadTime: number | null
  speechSynthesisTime: number | null
  audioGenerationSpeed: number | null
  
  // 缓存性能
  cacheHitRate: number
  cacheSize: number
  cacheOperationTime: number
  
  // 网络性能
  networkLatency: number
  bandwidth: number | null
  
  // 时间戳和上下文
  timestamp: number
  sessionId: string
}

// 性能会话接口
export interface PerformanceSession {
  id: string
  startTime: number
  endTime: number
  userAgent: string
  metrics: PerformanceMetrics[]
  aiMetrics: AIPerformanceMetrics[]
  errors: PerformanceError[]
  route: string
}

// 性能错误接口
export interface PerformanceError {
  timestamp: number
  type: 'memory-leak' | 'slow-api' | 'bundle-size' | 'web-vital' | 'ai-load' | 'model-load' | 'inference' | 'tts-load'
  message: string
  context: any
  severity: 'low' | 'medium' | 'high' | 'critical'
}

// 时间范围接口
export interface TimeRange {
  start: number
  end: number
}

// 性能收集器接口
export interface PerformanceCollector {
  startMonitoring(): void
  stopMonitoring(): void
  collectMetrics(): PerformanceMetrics
  reportMetric(name: string, value: number, context?: any): void
  getMetricsHistory(timeRange: TimeRange): PerformanceMetrics[]
  
  // AI性能监控方法
  reportAILibraryLoad(libraryName: string, loadTime: number, size: number, source: 'cdn' | 'cache' | 'fallback'): void
  reportModelLoad(modelId: string, loadTime: number, size: number, source: 'download' | 'cache', downloadSpeed?: number): void
  reportInference(modelId: string, inferenceTime: number, tokensPerSecond: number, totalTokens: number, memoryUsage: number): void
  reportTTSLoad(engineLoadTime: number, speechTime?: number, audioSpeed?: number): void
  reportCacheOperation(operation: string, time: number, hitRate: number, cacheSize: number): void
  getAIMetricsHistory(timeRange: TimeRange): AIPerformanceMetrics[]
  getAIPerformanceSummary(): AIPerformanceSummary
}

// AI性能摘要接口
export interface AIPerformanceSummary {
  averageLibraryLoadTime: number
  averageModelLoadTime: number
  averageInferenceTime: number
  averageTTSLoadTime: number
  cacheHitRate: number
  totalModelsLoaded: number
  totalInferences: number
  memoryEfficiency: number
  networkEfficiency: number
}

// 性能阈值配置
const PERFORMANCE_THRESHOLDS = {
  lcp: 2500,      // LCP should be < 2.5s
  fid: 100,       // FID should be < 100ms
  cls: 0.1,       // CLS should be < 0.1
  memory: 150,    // Memory should be < 150MB
  apiResponse: 3000, // API response should be < 3s
  
  // AI性能阈值
  aiLibraryLoad: 5000,    // AI库加载应该 < 5s
  modelLoad: 30000,       // 模型加载应该 < 30s
  inference: 10000,       // 推理应该 < 10s
  ttsLoad: 3000,          // TTS加载应该 < 3s
  cacheOperation: 1000,   // 缓存操作应该 < 1s
}

// 存储键名
const STORAGE_KEYS = {
  METRICS: 'performance_metrics',
  AI_METRICS: 'ai_performance_metrics',
  SESSION: 'performance_session',
  ERRORS: 'performance_errors'
}

class PerformanceMonitorImpl implements PerformanceCollector {
  private isMonitoring = false
  private currentSession: PerformanceSession | null = null
  private metricsBuffer: PerformanceMetrics[] = []
  private aiMetricsBuffer: AIPerformanceMetrics[] = []
  private observers: PerformanceObserver[] = []

  constructor() {
    this.initializeSession()
  }

  private initializeSession() {
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      endTime: 0,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Test Environment',
      metrics: [],
      aiMetrics: [],
      errors: [],
      route: typeof window !== 'undefined' ? window.location.pathname : '/test'
    }
  }

  private generateSessionId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  startMonitoring(): void {
    if (this.isMonitoring) return

    this.isMonitoring = true
    console.log('🚀 Performance monitoring started')

    // 监控 Core Web Vitals
    this.observeWebVitals()
    
    // 监控内存使用
    this.observeMemoryUsage()
    
    // 监控导航性能
    this.observeNavigationTiming()
    
    // 监控资源加载
    this.observeResourceTiming()

    // 定期收集指标
    this.startPeriodicCollection()
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return

    this.isMonitoring = false
    console.log('⏹️ Performance monitoring stopped')

    // 清理观察者
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []

    // 结束当前会话
    if (this.currentSession) {
      this.currentSession.endTime = Date.now()
      this.saveSession()
    }
  }

  collectMetrics(): PerformanceMetrics {
    const now = Date.now()
    
    return {
      lcp: this.getLCP(),
      fid: this.getFID(),
      cls: this.getCLS(),
      memoryUsage: this.getMemoryUsage(),
      bundleSize: this.getBundleSize(),
      loadTime: this.getLoadTime(),
      apiResponseTime: this.getAverageApiResponseTime(),
      
      // AI性能指标
      aiLibraryLoadTime: this.getAverageAILibraryLoadTime(),
      modelLoadTime: this.getAverageModelLoadTime(),
      inferenceTime: this.getAverageInferenceTime(),
      ttsLoadTime: this.getAverageTTSLoadTime(),
      cacheHitRate: this.getCacheHitRate(),
      
      timestamp: now,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Test Environment',
      networkType: this.getNetworkType(),
      route: typeof window !== 'undefined' ? window.location.pathname : '/test'
    }
  }

  reportMetric(name: string, value: number, context?: any): void {
    const metric = {
      name,
      value,
      timestamp: Date.now(),
      context
    }

    // 检查是否超过阈值
    this.checkThresholds(name, value, context)

    console.log(`📊 Performance metric: ${name} = ${value}`, context)
  }

  getMetricsHistory(timeRange: TimeRange): PerformanceMetrics[] {
    const stored = localStorage.getItem(STORAGE_KEYS.METRICS)
    if (!stored) return []

    try {
      const allMetrics: PerformanceMetrics[] = JSON.parse(stored)
      return allMetrics.filter(metric => 
        metric.timestamp >= timeRange.start && 
        metric.timestamp <= timeRange.end
      )
    } catch (e) {
      console.error('Failed to parse stored metrics:', e)
      return []
    }
  }

  private observeWebVitals() {
    // LCP (Largest Contentful Paint)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1] as any
          if (lastEntry) {
            this.reportMetric('lcp', lastEntry.startTime, { 
              element: lastEntry.element?.tagName 
            })
          }
        })
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
        this.observers.push(lcpObserver)
      } catch (e) {
        console.warn('LCP observation not supported:', e)
      }

      // FID (First Input Delay)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry: any) => {
            this.reportMetric('fid', entry.processingStart - entry.startTime, {
              eventType: entry.name
            })
          })
        })
        fidObserver.observe({ entryTypes: ['first-input'] })
        this.observers.push(fidObserver)
      } catch (e) {
        console.warn('FID observation not supported:', e)
      }

      // CLS (Cumulative Layout Shift)
      try {
        let clsValue = 0
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value
              this.reportMetric('cls', clsValue, {
                sources: entry.sources?.map((s: any) => s.node?.tagName)
              })
            }
          })
        })
        clsObserver.observe({ entryTypes: ['layout-shift'] })
        this.observers.push(clsObserver)
      } catch (e) {
        console.warn('CLS observation not supported:', e)
      }
    }
  }

  private observeMemoryUsage() {
    // 使用 performance.memory API (Chrome)
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory
        const memoryMB = memory.usedJSHeapSize / 1024 / 1024
        this.reportMetric('memory', memoryMB, {
          total: memory.totalJSHeapSize / 1024 / 1024,
          limit: memory.jsHeapSizeLimit / 1024 / 1024
        })
      }, 5000) // 每5秒检查一次
    }
  }

  private observeNavigationTiming() {
    if ('PerformanceObserver' in window) {
      try {
        const navObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry: any) => {
            this.reportMetric('navigation', entry.duration, {
              type: entry.type,
              redirectCount: entry.redirectCount
            })
          })
        })
        navObserver.observe({ entryTypes: ['navigation'] })
        this.observers.push(navObserver)
      } catch (e) {
        console.warn('Navigation timing observation not supported:', e)
      }
    }
  }

  private observeResourceTiming() {
    if ('PerformanceObserver' in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry: any) => {
            // 只监控重要资源
            if (entry.name.includes('.js') || entry.name.includes('.css') || 
                entry.name.includes('api/')) {
              this.reportMetric('resource', entry.duration, {
                name: entry.name,
                size: entry.transferSize,
                type: entry.initiatorType
              })
            }
          })
        })
        resourceObserver.observe({ entryTypes: ['resource'] })
        this.observers.push(resourceObserver)
      } catch (e) {
        console.warn('Resource timing observation not supported:', e)
      }
    }
  }

  private startPeriodicCollection() {
    setInterval(() => {
      if (this.isMonitoring) {
        const metrics = this.collectMetrics()
        this.metricsBuffer.push(metrics)
        
        // 每10个指标保存一次
        if (this.metricsBuffer.length >= 10) {
          this.saveMetrics()
        }
      }
    }, 10000) // 每10秒收集一次
  }

  private checkThresholds(name: string, value: number, context?: any) {
    let threshold: number | undefined
    let severity: PerformanceError['severity'] = 'medium'

    switch (name) {
      case 'lcp':
        threshold = PERFORMANCE_THRESHOLDS.lcp
        severity = value > threshold * 2 ? 'critical' : 'high'
        break
      case 'fid':
        threshold = PERFORMANCE_THRESHOLDS.fid
        severity = value > threshold * 2 ? 'high' : 'medium'
        break
      case 'cls':
        threshold = PERFORMANCE_THRESHOLDS.cls
        severity = value > threshold * 2 ? 'high' : 'medium'
        break
      case 'memory':
        threshold = PERFORMANCE_THRESHOLDS.memory
        severity = value > threshold * 1.5 ? 'critical' : 'high'
        break
      case 'resource':
        if (context?.name?.includes('api/')) {
          threshold = PERFORMANCE_THRESHOLDS.apiResponse
          severity = value > threshold * 2 ? 'high' : 'medium'
        }
        break
    }

    if (threshold && value > threshold) {
      this.reportError({
        timestamp: Date.now(),
        type: name.includes('api') ? 'slow-api' : 'web-vital',
        message: `${name} exceeded threshold: ${value} > ${threshold}`,
        context,
        severity
      })
    }
  }

  private reportError(error: PerformanceError) {
    console.warn(`⚠️ Performance issue: ${error.message}`, error.context)
    
    if (this.currentSession) {
      this.currentSession.errors.push(error)
    }

    // 保存错误到本地存储
    const stored = localStorage.getItem(STORAGE_KEYS.ERRORS) || '[]'
    try {
      const errors: PerformanceError[] = JSON.parse(stored)
      errors.push(error)
      
      // 只保留最近1000个错误
      if (errors.length > 1000) {
        errors.splice(0, errors.length - 1000)
      }
      
      localStorage.setItem(STORAGE_KEYS.ERRORS, JSON.stringify(errors))
    } catch (e) {
      console.error('Failed to save performance error:', e)
    }
  }

  private saveMetrics() {
    if (this.metricsBuffer.length === 0) return

    const stored = localStorage.getItem(STORAGE_KEYS.METRICS) || '[]'
    try {
      const allMetrics: PerformanceMetrics[] = JSON.parse(stored)
      allMetrics.push(...this.metricsBuffer)
      
      // 只保留最近1000个指标
      if (allMetrics.length > 1000) {
        allMetrics.splice(0, allMetrics.length - 1000)
      }
      
      localStorage.setItem(STORAGE_KEYS.METRICS, JSON.stringify(allMetrics))
      this.metricsBuffer = []
    } catch (e) {
      console.error('Failed to save performance metrics:', e)
    }
  }

  private saveSession() {
    if (!this.currentSession) return

    try {
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.currentSession))
    } catch (e) {
      console.error('Failed to save performance session:', e)
    }
  }

  // 获取具体指标的辅助方法
  private getLCP(): number | null {
    if ('PerformanceObserver' in window) {
      const entries = performance.getEntriesByType('largest-contentful-paint')
      if (entries.length > 0) {
        return entries[entries.length - 1].startTime
      }
    }
    return null
  }

  private getFID(): number | null {
    if ('PerformanceObserver' in window) {
      const entries = performance.getEntriesByType('first-input')
      if (entries.length > 0) {
        const entry = entries[0] as any
        return entry.processingStart - entry.startTime
      }
    }
    return null
  }

  private getCLS(): number | null {
    if ('PerformanceObserver' in window) {
      const entries = performance.getEntriesByType('layout-shift')
      let clsValue = 0
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value
        }
      })
      return clsValue
    }
    return null
  }

  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      return memory.usedJSHeapSize / 1024 / 1024 // MB
    }
    return 0
  }

  private getBundleSize(): number {
    // 估算当前加载的JS大小
    if (typeof document === 'undefined') return 0
    
    const scripts = document.querySelectorAll('script[src]')
    let totalSize = 0
    
    scripts.forEach(script => {
      const src = (script as HTMLScriptElement).src
      if (src && !src.includes('node_modules')) {
        // 这里只是估算，实际大小需要从网络请求中获取
        totalSize += 100 // 假设每个脚本100KB
      }
    })
    
    return totalSize
  }

  private getLoadTime(): number {
    const navigation = performance.getEntriesByType('navigation')[0] as any
    return navigation ? navigation.loadEventEnd - navigation.navigationStart : 0
  }

  private getAverageApiResponseTime(): number {
    const resources = performance.getEntriesByType('resource')
    const apiRequests = resources.filter(resource => resource.name.includes('api/'))
    
    if (apiRequests.length === 0) return 0
    
    const totalTime = apiRequests.reduce((sum, request) => sum + request.duration, 0)
    return totalTime / apiRequests.length
  }

  private getNetworkType(): string {
    if (typeof navigator === 'undefined') return 'unknown'
    const connection = (navigator as any).connection
    return connection ? connection.effectiveType || 'unknown' : 'unknown'
  }

  // 新增方法供性能预算系统使用
  getMetrics() {
    return {
      lcp: this.getLCP(),
      fid: this.getFID(),
      cls: this.getCLS(),
      fcp: this.getFCP(),
      ttfb: this.getTTFB()
    }
  }

  getMemoryInfo() {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      return {
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize,
        heapLimit: memory.jsHeapSizeLimit
      }
    }
    return {
      heapUsed: 0,
      heapTotal: 0,
      heapLimit: 0
    }
  }

  getNetworkInfo() {
    const resources = performance.getEntriesByType('resource')
    const totalSize = resources.reduce((sum, resource) => sum + (resource as any).transferSize || 0, 0)
    
    return {
      requestCount: resources.length,
      totalSize,
      averageResponseTime: this.getAverageApiResponseTime()
    }
  }

  getRenderingInfo() {
    // 获取渲染性能信息
    const longTasks = performance.getEntriesByType('longtask')
    const layoutShifts = performance.getEntriesByType('layout-shift')
    
    return {
      averageFPS: this.calculateAverageFPS(),
      longTaskCount: longTasks.length,
      layoutShiftCount: layoutShifts.length
    }
  }

  private getFCP(): number | null {
    const entries = performance.getEntriesByType('paint')
    const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint')
    return fcpEntry ? fcpEntry.startTime : null
  }

  private getTTFB(): number | null {
    const navigation = performance.getEntriesByType('navigation')[0] as any
    return navigation ? navigation.responseStart - navigation.navigationStart : null
  }

  private calculateAverageFPS(): number {
    // 简化的FPS计算，实际应用中可能需要更复杂的实现
    return 60 // 假设60FPS，实际需要通过requestAnimationFrame测量
  }

  // API响应时间报告方法
  reportApiResponse(endpoint: string, responseTime: number, status: number) {
    this.reportMetric('api_response_time', responseTime, {
      endpoint,
      status,
      timestamp: Date.now()
    })
  }

  // ===== AI性能监控方法 =====

  /**
   * 报告AI库加载性能
   */
  reportAILibraryLoad(libraryName: string, loadTime: number, size: number, source: 'cdn' | 'cache' | 'fallback'): void {
    const aiMetric: AIPerformanceMetrics = {
      libraryLoadTime: loadTime,
      librarySize: size,
      librarySource: source,
      modelId: '',
      modelLoadTime: 0,
      modelSize: 0,
      modelSource: 'cache',
      downloadSpeed: null,
      inferenceTime: 0,
      tokensPerSecond: 0,
      totalTokens: 0,
      memoryUsage: this.getMemoryUsage(),
      ttsEngineLoadTime: null,
      speechSynthesisTime: null,
      audioGenerationSpeed: null,
      cacheHitRate: 0,
      cacheSize: 0,
      cacheOperationTime: 0,
      networkLatency: this.getNetworkLatency(),
      bandwidth: this.getBandwidth(),
      timestamp: Date.now(),
      sessionId: this.currentSession?.id || ''
    }

    this.aiMetricsBuffer.push(aiMetric)
    this.reportMetric('ai_library_load', loadTime, {
      libraryName,
      size,
      source
    })

    // 检查阈值
    if (loadTime > PERFORMANCE_THRESHOLDS.aiLibraryLoad) {
      this.reportError({
        timestamp: Date.now(),
        type: 'ai-load',
        message: `AI库 ${libraryName} 加载时间过长: ${loadTime}ms > ${PERFORMANCE_THRESHOLDS.aiLibraryLoad}ms`,
        context: { libraryName, loadTime, size, source },
        severity: loadTime > PERFORMANCE_THRESHOLDS.aiLibraryLoad * 2 ? 'critical' : 'high'
      })
    }

    console.log(`🤖 AI Library Load: ${libraryName} loaded in ${loadTime}ms from ${source}`)
  }

  /**
   * 报告模型加载性能
   */
  reportModelLoad(modelId: string, loadTime: number, size: number, source: 'download' | 'cache', downloadSpeed?: number): void {
    const aiMetric: AIPerformanceMetrics = {
      libraryLoadTime: 0,
      librarySize: 0,
      librarySource: 'cache',
      modelId,
      modelLoadTime: loadTime,
      modelSize: size,
      modelSource: source,
      downloadSpeed: downloadSpeed || null,
      inferenceTime: 0,
      tokensPerSecond: 0,
      totalTokens: 0,
      memoryUsage: this.getMemoryUsage(),
      ttsEngineLoadTime: null,
      speechSynthesisTime: null,
      audioGenerationSpeed: null,
      cacheHitRate: source === 'cache' ? 1 : 0,
      cacheSize: 0,
      cacheOperationTime: 0,
      networkLatency: this.getNetworkLatency(),
      bandwidth: this.getBandwidth(),
      timestamp: Date.now(),
      sessionId: this.currentSession?.id || ''
    }

    this.aiMetricsBuffer.push(aiMetric)
    this.reportMetric('model_load', loadTime, {
      modelId,
      size,
      source,
      downloadSpeed
    })

    // 检查阈值
    if (loadTime > PERFORMANCE_THRESHOLDS.modelLoad) {
      this.reportError({
        timestamp: Date.now(),
        type: 'model-load',
        message: `模型 ${modelId} 加载时间过长: ${loadTime}ms > ${PERFORMANCE_THRESHOLDS.modelLoad}ms`,
        context: { modelId, loadTime, size, source, downloadSpeed },
        severity: loadTime > PERFORMANCE_THRESHOLDS.modelLoad * 2 ? 'critical' : 'high'
      })
    }

    console.log(`🧠 Model Load: ${modelId} loaded in ${loadTime}ms from ${source}`)
  }

  /**
   * 报告推理性能
   */
  reportInference(modelId: string, inferenceTime: number, tokensPerSecond: number, totalTokens: number, memoryUsage: number): void {
    const aiMetric: AIPerformanceMetrics = {
      libraryLoadTime: 0,
      librarySize: 0,
      librarySource: 'cache',
      modelId,
      modelLoadTime: 0,
      modelSize: 0,
      modelSource: 'cache',
      downloadSpeed: null,
      inferenceTime,
      tokensPerSecond,
      totalTokens,
      memoryUsage,
      ttsEngineLoadTime: null,
      speechSynthesisTime: null,
      audioGenerationSpeed: null,
      cacheHitRate: 0,
      cacheSize: 0,
      cacheOperationTime: 0,
      networkLatency: this.getNetworkLatency(),
      bandwidth: this.getBandwidth(),
      timestamp: Date.now(),
      sessionId: this.currentSession?.id || ''
    }

    this.aiMetricsBuffer.push(aiMetric)
    this.reportMetric('inference', inferenceTime, {
      modelId,
      tokensPerSecond,
      totalTokens,
      memoryUsage
    })

    // 检查阈值
    if (inferenceTime > PERFORMANCE_THRESHOLDS.inference) {
      this.reportError({
        timestamp: Date.now(),
        type: 'inference',
        message: `推理时间过长: ${inferenceTime}ms > ${PERFORMANCE_THRESHOLDS.inference}ms`,
        context: { modelId, inferenceTime, tokensPerSecond, totalTokens },
        severity: inferenceTime > PERFORMANCE_THRESHOLDS.inference * 2 ? 'high' : 'medium'
      })
    }

    console.log(`⚡ Inference: ${modelId} completed in ${inferenceTime}ms (${tokensPerSecond} tokens/s)`)
  }

  /**
   * 报告TTS加载性能
   */
  reportTTSLoad(engineLoadTime: number, speechTime?: number, audioSpeed?: number): void {
    const aiMetric: AIPerformanceMetrics = {
      libraryLoadTime: 0,
      librarySize: 0,
      librarySource: 'cache',
      modelId: '',
      modelLoadTime: 0,
      modelSize: 0,
      modelSource: 'cache',
      downloadSpeed: null,
      inferenceTime: 0,
      tokensPerSecond: 0,
      totalTokens: 0,
      memoryUsage: this.getMemoryUsage(),
      ttsEngineLoadTime: engineLoadTime,
      speechSynthesisTime: speechTime || null,
      audioGenerationSpeed: audioSpeed || null,
      cacheHitRate: 0,
      cacheSize: 0,
      cacheOperationTime: 0,
      networkLatency: this.getNetworkLatency(),
      bandwidth: this.getBandwidth(),
      timestamp: Date.now(),
      sessionId: this.currentSession?.id || ''
    }

    this.aiMetricsBuffer.push(aiMetric)
    this.reportMetric('tts_load', engineLoadTime, {
      speechTime,
      audioSpeed
    })

    // 检查阈值
    if (engineLoadTime > PERFORMANCE_THRESHOLDS.ttsLoad) {
      this.reportError({
        timestamp: Date.now(),
        type: 'tts-load',
        message: `TTS引擎加载时间过长: ${engineLoadTime}ms > ${PERFORMANCE_THRESHOLDS.ttsLoad}ms`,
        context: { engineLoadTime, speechTime, audioSpeed },
        severity: engineLoadTime > PERFORMANCE_THRESHOLDS.ttsLoad * 2 ? 'high' : 'medium'
      })
    }

    console.log(`🔊 TTS Load: Engine loaded in ${engineLoadTime}ms`)
  }

  /**
   * 报告缓存操作性能
   */
  reportCacheOperation(operation: string, time: number, hitRate: number, cacheSize: number): void {
    const aiMetric: AIPerformanceMetrics = {
      libraryLoadTime: 0,
      librarySize: 0,
      librarySource: 'cache',
      modelId: '',
      modelLoadTime: 0,
      modelSize: 0,
      modelSource: 'cache',
      downloadSpeed: null,
      inferenceTime: 0,
      tokensPerSecond: 0,
      totalTokens: 0,
      memoryUsage: this.getMemoryUsage(),
      ttsEngineLoadTime: null,
      speechSynthesisTime: null,
      audioGenerationSpeed: null,
      cacheHitRate: hitRate,
      cacheSize,
      cacheOperationTime: time,
      networkLatency: this.getNetworkLatency(),
      bandwidth: this.getBandwidth(),
      timestamp: Date.now(),
      sessionId: this.currentSession?.id || ''
    }

    this.aiMetricsBuffer.push(aiMetric)
    this.reportMetric('cache_operation', time, {
      operation,
      hitRate,
      cacheSize
    })

    // 检查阈值
    if (time > PERFORMANCE_THRESHOLDS.cacheOperation) {
      this.reportError({
        timestamp: Date.now(),
        type: 'ai-load',
        message: `缓存操作时间过长: ${operation} ${time}ms > ${PERFORMANCE_THRESHOLDS.cacheOperation}ms`,
        context: { operation, time, hitRate, cacheSize },
        severity: 'medium'
      })
    }

    console.log(`💾 Cache Operation: ${operation} completed in ${time}ms (hit rate: ${(hitRate * 100).toFixed(1)}%)`)
  }

  /**
   * 获取AI性能指标历史
   */
  getAIMetricsHistory(timeRange: TimeRange): AIPerformanceMetrics[] {
    const stored = localStorage.getItem(STORAGE_KEYS.AI_METRICS)
    if (!stored) return []

    try {
      const allMetrics: AIPerformanceMetrics[] = JSON.parse(stored)
      return allMetrics.filter(metric => 
        metric.timestamp >= timeRange.start && 
        metric.timestamp <= timeRange.end
      )
    } catch (e) {
      console.error('Failed to parse stored AI metrics:', e)
      return []
    }
  }

  /**
   * 获取AI性能摘要
   */
  getAIPerformanceSummary(): AIPerformanceSummary {
    const now = Date.now()
    const last24Hours = now - 24 * 60 * 60 * 1000
    
    // 合并缓冲区和存储的指标
    const storedMetrics = this.getAIMetricsHistory({ start: last24Hours, end: now })
    const allMetrics = [...storedMetrics, ...this.aiMetricsBuffer]

    if (allMetrics.length === 0) {
      return {
        averageLibraryLoadTime: 0,
        averageModelLoadTime: 0,
        averageInferenceTime: 0,
        averageTTSLoadTime: 0,
        cacheHitRate: 0,
        totalModelsLoaded: 0,
        totalInferences: 0,
        memoryEfficiency: 0,
        networkEfficiency: 0
      }
    }

    const libraryLoads = allMetrics.filter(m => m.libraryLoadTime > 0)
    const modelLoads = allMetrics.filter(m => m.modelLoadTime > 0)
    const inferences = allMetrics.filter(m => m.inferenceTime > 0)
    const ttsLoads = allMetrics.filter(m => m.ttsEngineLoadTime && m.ttsEngineLoadTime > 0)
    const cacheOps = allMetrics.filter(m => m.cacheOperationTime > 0)

    return {
      averageLibraryLoadTime: libraryLoads.length > 0 ? 
        libraryLoads.reduce((sum, m) => sum + m.libraryLoadTime, 0) / libraryLoads.length : 0,
      averageModelLoadTime: modelLoads.length > 0 ? 
        modelLoads.reduce((sum, m) => sum + m.modelLoadTime, 0) / modelLoads.length : 0,
      averageInferenceTime: inferences.length > 0 ? 
        inferences.reduce((sum, m) => sum + m.inferenceTime, 0) / inferences.length : 0,
      averageTTSLoadTime: ttsLoads.length > 0 ? 
        ttsLoads.reduce((sum, m) => sum + (m.ttsEngineLoadTime || 0), 0) / ttsLoads.length : 0,
      cacheHitRate: cacheOps.length > 0 ? 
        cacheOps.reduce((sum, m) => sum + m.cacheHitRate, 0) / cacheOps.length : 0,
      totalModelsLoaded: modelLoads.length,
      totalInferences: inferences.length,
      memoryEfficiency: this.calculateMemoryEfficiency(allMetrics),
      networkEfficiency: this.calculateNetworkEfficiency(allMetrics)
    }
  }

  // ===== AI性能指标计算辅助方法 =====

  private getAverageAILibraryLoadTime(): number | null {
    // 合并缓冲区和存储的指标
    const storedMetrics = this.getAIMetricsHistory({ start: 0, end: Date.now() })
    const allMetrics = [...storedMetrics, ...this.aiMetricsBuffer]
    const metrics = allMetrics.filter(m => m.libraryLoadTime > 0)
    if (metrics.length === 0) return null
    return metrics.reduce((sum, m) => sum + m.libraryLoadTime, 0) / metrics.length
  }

  private getAverageModelLoadTime(): number | null {
    const storedMetrics = this.getAIMetricsHistory({ start: 0, end: Date.now() })
    const allMetrics = [...storedMetrics, ...this.aiMetricsBuffer]
    const metrics = allMetrics.filter(m => m.modelLoadTime > 0)
    if (metrics.length === 0) return null
    return metrics.reduce((sum, m) => sum + m.modelLoadTime, 0) / metrics.length
  }

  private getAverageInferenceTime(): number | null {
    const storedMetrics = this.getAIMetricsHistory({ start: 0, end: Date.now() })
    const allMetrics = [...storedMetrics, ...this.aiMetricsBuffer]
    const metrics = allMetrics.filter(m => m.inferenceTime > 0)
    if (metrics.length === 0) return null
    return metrics.reduce((sum, m) => sum + m.inferenceTime, 0) / metrics.length
  }

  private getAverageTTSLoadTime(): number | null {
    const storedMetrics = this.getAIMetricsHistory({ start: 0, end: Date.now() })
    const allMetrics = [...storedMetrics, ...this.aiMetricsBuffer]
    const metrics = allMetrics.filter(m => m.ttsEngineLoadTime && m.ttsEngineLoadTime > 0)
    if (metrics.length === 0) return null
    return metrics.reduce((sum, m) => sum + (m.ttsEngineLoadTime || 0), 0) / metrics.length
  }

  private getCacheHitRate(): number | null {
    const storedMetrics = this.getAIMetricsHistory({ start: 0, end: Date.now() })
    const allMetrics = [...storedMetrics, ...this.aiMetricsBuffer]
    const metrics = allMetrics.filter(m => m.cacheOperationTime > 0)
    if (metrics.length === 0) return null
    return metrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / metrics.length
  }

  private getNetworkLatency(): number {
    if (typeof navigator === 'undefined') return 100
    const connection = (navigator as any).connection
    return connection ? connection.rtt || 100 : 100
  }

  private getBandwidth(): number | null {
    if (typeof navigator === 'undefined') return null
    const connection = (navigator as any).connection
    return connection ? connection.downlink || null : null
  }

  private calculateMemoryEfficiency(metrics: AIPerformanceMetrics[]): number {
    if (metrics.length === 0) return 0
    
    const memoryUsages = metrics.map(m => m.memoryUsage).filter(m => m > 0)
    if (memoryUsages.length === 0) return 0
    
    const averageMemory = memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length
    // 内存效率：越低越好，这里用倒数表示效率
    return Math.max(0, 1 - (averageMemory / 500)) // 假设500MB为基准
  }

  private calculateNetworkEfficiency(metrics: AIPerformanceMetrics[]): number {
    if (metrics.length === 0) return 0
    
    const downloadSpeeds = metrics.map(m => m.downloadSpeed).filter(s => s !== null && s > 0) as number[]
    if (downloadSpeeds.length === 0) return 0
    
    const averageSpeed = downloadSpeeds.reduce((sum, s) => sum + s, 0) / downloadSpeeds.length
    // 网络效率：速度越快效率越高
    return Math.min(1, averageSpeed / 10) // 假设10MB/s为满分
  }

  // 重写保存方法以包含AI指标
  private saveMetrics() {
    if (this.metricsBuffer.length === 0 && this.aiMetricsBuffer.length === 0) return

    // 保存常规指标
    if (this.metricsBuffer.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEYS.METRICS) || '[]'
      try {
        const allMetrics: PerformanceMetrics[] = JSON.parse(stored)
        allMetrics.push(...this.metricsBuffer)
        
        // 只保留最近1000个指标
        if (allMetrics.length > 1000) {
          allMetrics.splice(0, allMetrics.length - 1000)
        }
        
        localStorage.setItem(STORAGE_KEYS.METRICS, JSON.stringify(allMetrics))
        this.metricsBuffer = []
      } catch (e) {
        console.error('Failed to save performance metrics:', e)
      }
    }

    // 保存AI指标
    if (this.aiMetricsBuffer.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEYS.AI_METRICS) || '[]'
      try {
        const allAIMetrics: AIPerformanceMetrics[] = JSON.parse(stored)
        allAIMetrics.push(...this.aiMetricsBuffer)
        
        // 只保留最近1000个指标
        if (allAIMetrics.length > 1000) {
          allAIMetrics.splice(0, allAIMetrics.length - 1000)
        }
        
        localStorage.setItem(STORAGE_KEYS.AI_METRICS, JSON.stringify(allAIMetrics))
        this.aiMetricsBuffer = []
      } catch (e) {
        console.error('Failed to save AI performance metrics:', e)
      }
    }
  }
}

// 创建全局性能监控实例
export const performanceMonitor = new PerformanceMonitorImpl()

// 自动启动监控（在生产环境中）
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  performanceMonitor.startMonitoring()
  
  // 页面卸载时停止监控
  window.addEventListener('beforeunload', () => {
    performanceMonitor.stopMonitoring()
  })
}

// 导出类型和实例
export type { PerformanceCollector }
export { PERFORMANCE_THRESHOLDS, STORAGE_KEYS }