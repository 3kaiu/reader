/**
 * Performance Monitor - 性能监控系统
 * 负责收集、存储和分析应用性能指标
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
  
  // 上下文信息
  timestamp: number
  userAgent: string
  networkType: string
  route: string
}

// 性能会话接口
export interface PerformanceSession {
  id: string
  startTime: number
  endTime: number
  userAgent: string
  metrics: PerformanceMetrics[]
  errors: PerformanceError[]
  route: string
}

// 性能错误接口
export interface PerformanceError {
  timestamp: number
  type: 'memory-leak' | 'slow-api' | 'bundle-size' | 'web-vital'
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
}

// 性能阈值配置
const PERFORMANCE_THRESHOLDS = {
  lcp: 2500,      // LCP should be < 2.5s
  fid: 100,       // FID should be < 100ms
  cls: 0.1,       // CLS should be < 0.1
  memory: 150,    // Memory should be < 150MB
  apiResponse: 3000, // API response should be < 3s
}

// 存储键名
const STORAGE_KEYS = {
  METRICS: 'performance_metrics',
  SESSION: 'performance_session',
  ERRORS: 'performance_errors'
}

class PerformanceMonitorImpl implements PerformanceCollector {
  private isMonitoring = false
  private currentSession: PerformanceSession | null = null
  private metricsBuffer: PerformanceMetrics[] = []
  private observers: PerformanceObserver[] = []

  constructor() {
    this.initializeSession()
  }

  private initializeSession() {
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      endTime: 0,
      userAgent: navigator.userAgent,
      metrics: [],
      errors: [],
      route: window.location.pathname
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
      timestamp: now,
      userAgent: navigator.userAgent,
      networkType: this.getNetworkType(),
      route: window.location.pathname
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