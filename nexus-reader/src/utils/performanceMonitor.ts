/**
 * Performance Monitor
 * Monitors and tracks application performance metrics
 */

// Performance thresholds for scoring
export const PERFORMANCE_THRESHOLDS = {
  lcp: 2500,        // 2.5s for LCP (Largest Contentful Paint)
  fid: 100,         // 100ms for FID (First Input Delay)
  cls: 0.1,         // 0.1 for CLS (Cumulative Layout Shift)
  memory: 100,      // 100MB memory usage
  apiResponse: 500, // 500ms for API response
}

// Error severity levels
export interface PerformanceError {
  id: string
  timestamp: number
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  context?: any
}

// Time range for metrics history
export interface TimeRange {
  start: number
  end: number
}

export interface PerformanceMetrics {
  memory: {
    used: number
    total: number
    percentage: number
  }
  timing: {
    loadTime: number
    renderTime: number
    interactionTime: number
  }
  network: {
    requests: number
    totalSize: number
    averageResponseTime: number
  }
  errors: {
    count: number
    rate: number
  }
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    memory: { used: 0, total: 0, percentage: 0 },
    timing: { loadTime: 0, renderTime: 0, interactionTime: 0 },
    network: { requests: 0, totalSize: 0, averageResponseTime: 0 },
    errors: { count: 0, rate: 0 }
  }

  private observers: PerformanceObserver[] = []
  private startTime = Date.now()
  private running = false

  // AI performance tracking
  private aiMetrics = {
    libraryLoads: [] as Array<{ name: string, time: number, size?: number, source?: string }>,
    modelLoads: [] as Array<{ id: string, time: number, size?: number, source?: string, speed?: number }>,
    inferences: [] as Array<{ id: string, time: number, tokens?: number, memory?: number, speed?: number }>,
    ttsLoads: [] as Array<{ engineTime: number, speechTime?: number, speed?: number }>,
    cacheOps: [] as Array<{ operation: string, time: number, hit?: boolean, size?: number }>
  }

  private metricsHistory: any[] = []

  constructor() {
    this.initializeObservers()
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    this.updateMemoryMetrics()
    this.updateTimingMetrics()
    return { ...this.metrics }
  }

  /**
   * Record network request
   */
  recordNetworkRequest(size: number, responseTime: number): void {
    this.metrics.network.requests++
    this.metrics.network.totalSize += size

    // Update average response time
    const totalTime = this.metrics.network.averageResponseTime * (this.metrics.network.requests - 1) + responseTime
    this.metrics.network.averageResponseTime = totalTime / this.metrics.network.requests
  }

  /**
   * Record error
   */
  recordError(): void {
    this.metrics.errors.count++
    const timeElapsed = (Date.now() - this.startTime) / 1000
    this.metrics.errors.rate = this.metrics.errors.count / timeElapsed
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    this.startTime = Date.now()
    this.running = true
    this.initializeObservers()
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    this.running = false
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
  }

  /**
   * Check if monitoring is running
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Stop monitoring (alias for stop)
   */
  stopMonitoring(): void {
    this.stop()
  }

  /**
   * Initialize session
   */
  initializeSession(): void {
    this.startTime = Date.now()
    this.metrics = {
      memory: { used: 0, total: 0, percentage: 0 },
      timing: { loadTime: 0, renderTime: 0, interactionTime: 0 },
      network: { requests: 0, totalSize: 0, averageResponseTime: 0 },
      errors: { count: 0, rate: 0 }
    }
  }

  /**
   * Report AI library load performance
   */
  reportAILibraryLoad(
    libraryName: string,
    loadTime: number,
    size?: number,
    source?: string
  ): void {
    const sourceText = source ? ` from ${source}` : ''
    console.log(`🤖 AI Library Load: ${libraryName} loaded in ${loadTime}ms${sourceText}`)

    // Store metrics
    this.aiMetrics.libraryLoads.push({ name: libraryName, time: loadTime, size, source })

    // Check thresholds
    if (loadTime > 5000) {
      console.warn('⚠️ Performance issue:', {
        libraryName,
        loadTime
      })
    }
  }

  /**
   * Report model load performance
   */
  reportModelLoad(
    modelId: string,
    loadTime: number,
    size?: number,
    source?: string,
    downloadSpeed?: number
  ): void {
    const sourceText = source === 'cache' ? 'from cache' : `loaded in ${loadTime}ms from ${source || 'download'}`
    console.log(`🧠 Model Load: ${modelId} ${sourceText}`)

    // Store metrics
    this.aiMetrics.modelLoads.push({ id: modelId, time: loadTime, size, source, speed: downloadSpeed })

    // Check thresholds
    if (loadTime > 30000) {
      console.warn('⚠️ Performance issue:', {
        modelId,
        loadTime
      })
    }
  }

  /**
   * Report inference performance
   */
  reportInference(
    modelId: string,
    inferenceTime: number,
    tokensGenerated?: number,
    memoryUsage?: number,
    tokensPerSecond?: number
  ): void {
    console.log(`⚡ Inference: ${modelId} completed in ${inferenceTime}ms (${tokensPerSecond || 0} tokens/s)`)

    // Store metrics
    this.aiMetrics.inferences.push({
      id: modelId,
      time: inferenceTime,
      tokens: tokensGenerated,
      memory: memoryUsage,
      speed: tokensPerSecond
    })

    // Check thresholds
    if (inferenceTime > 10000) {
      console.warn('⚠️ Performance issue:', {
        modelId,
        inferenceTime
      })
    }
  }

  /**
   * Report TTS load performance
   */
  reportTTSLoad(
    engineLoadTime: number,
    speechTime?: number,
    audioSpeed?: number
  ): void {
    console.log(`🔊 TTS Load: Engine loaded in ${engineLoadTime}ms`)

    // Store metrics
    this.aiMetrics.ttsLoads.push({ engineTime: engineLoadTime, speechTime, speed: audioSpeed })

    // Check thresholds
    if (engineLoadTime > 3000) {
      console.warn('⚠️ Performance issue:', {
        engineLoadTime
      })
    }
  }

  /**
   * Report cache operation performance
   */
  reportCacheOperation(
    operation: string,
    time: number,
    hit?: boolean,
    cacheSize?: number
  ): void {
    const hitRate = typeof hit === 'boolean' ? (hit ? 100 : 0) : (typeof hit === 'number' ? hit * 100 : 0)
    console.log(`💾 Cache Operation: ${operation} completed in ${time}ms (hit rate: ${hitRate.toFixed(1)}%)`)

    // Store metrics
    this.aiMetrics.cacheOps.push({ operation, time, hit, size: cacheSize })

    // Check thresholds
    if (time > 1000) {
      console.warn('⚠️ Performance issue:', {
        operation,
        time
      })
    }
  }

  /**
   * Get AI performance summary
   */
  getAIPerformanceSummary(): {
    averageLoadTime: number
    averageInferenceTime: number
    networkEfficiency: number
    memoryEfficiency: number
    totalModelsLoaded?: number
    totalInferences?: number
    averageLibraryLoadTime?: number
    averageModelLoadTime?: number
    aiLibraryLoadTime?: number
    modelLoadTime?: number
    inferenceTime?: number
    cacheHitRate?: number
    ttsLoadTime?: number
  } {
    const avgLibraryLoadTime = this.aiMetrics.libraryLoads.length > 0
      ? this.aiMetrics.libraryLoads.reduce((sum, load) => sum + load.time, 0) / this.aiMetrics.libraryLoads.length
      : 0

    const avgModelLoadTime = this.aiMetrics.modelLoads.length > 0
      ? this.aiMetrics.modelLoads.reduce((sum, load) => sum + load.time, 0) / this.aiMetrics.modelLoads.length
      : 0

    const avgInferenceTime = this.aiMetrics.inferences.length > 0
      ? this.aiMetrics.inferences.reduce((sum, inf) => sum + inf.time, 0) / this.aiMetrics.inferences.length
      : 0

    const avgCacheHitRate = this.aiMetrics.cacheOps.length > 0
      ? this.aiMetrics.cacheOps.filter(op => op.hit === true).length / this.aiMetrics.cacheOps.length
      : 0

    const avgTTSLoadTime = this.aiMetrics.ttsLoads.length > 0
      ? this.aiMetrics.ttsLoads.reduce((sum, load) => sum + load.engineTime, 0) / this.aiMetrics.ttsLoads.length
      : 0

    return {
      averageLoadTime: avgLibraryLoadTime,
      averageInferenceTime: avgInferenceTime,
      networkEfficiency: 0.8,
      memoryEfficiency: 0.7,
      totalModelsLoaded: this.aiMetrics.modelLoads.length,
      totalInferences: this.aiMetrics.inferences.length,
      averageLibraryLoadTime: avgLibraryLoadTime,
      averageModelLoadTime: avgModelLoadTime,
      aiLibraryLoadTime: avgLibraryLoadTime,
      modelLoadTime: avgModelLoadTime,
      inferenceTime: avgInferenceTime,
      cacheHitRate: avgCacheHitRate,
      ttsLoadTime: avgTTSLoadTime
    }
  }

  /**
   * Collect current metrics
   */
  collectMetrics(): any {
    const summary = this.getAIPerformanceSummary()

    return {
      ...summary,
      timestamp: Date.now()
    }
  }

  /**
   * Save metrics to storage
   */
  saveMetrics(): void {
    try {
      const currentMetrics = this.collectMetrics()
      this.metricsHistory.push({
        timestamp: Date.now(),
        ...currentMetrics
      })

      // Limit history size
      if (this.metricsHistory.length > 100) {
        this.metricsHistory = this.metricsHistory.slice(-100)
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('performance-metrics-history', JSON.stringify(this.metricsHistory))
      }
    } catch (error) {
      console.warn('Failed to save performance metrics:', error)
    }
  }

  /**
   * Get AI metrics history
   */
  getAIMetricsHistory(timeRange?: { start: number, end: number }): any[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('performance-metrics-history')
        if (stored) {
          this.metricsHistory = JSON.parse(stored)
        }
      }
    } catch (error) {
      console.warn('Failed to load metrics history:', error)
    }

    if (timeRange) {
      return this.metricsHistory.filter(metric =>
        metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end
      )
    }

    return [...this.metricsHistory]
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    this.start()
  }

  /**
   * Report custom metric
   */
  reportMetric(name: string, value: number, context?: any): void {
    console.log(`📊 Custom Metric: ${name} = ${value}`, context)
  }

  /**
   * Get metrics history for time range
   */
  getMetricsHistory(timeRange?: TimeRange): any[] {
    return this.getAIMetricsHistory(timeRange)
  }

  /**
   * Initialize performance observers
   */
  private initializeObservers(): void {
    if (typeof window === 'undefined' || !window.PerformanceObserver) {
      return
    }

    try {
      // Navigation timing observer
      const navObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach(entry => {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming
            this.metrics.timing.loadTime = navEntry.loadEventEnd - navEntry.fetchStart
          }
        })
      })
      navObserver.observe({ entryTypes: ['navigation'] })
      this.observers.push(navObserver)

      // Paint timing observer
      const paintObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach(entry => {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.timing.renderTime = entry.startTime
          }
        })
      })
      paintObserver.observe({ entryTypes: ['paint'] })
      this.observers.push(paintObserver)

    } catch (error) {
      console.warn('Performance observers not supported:', error)
    }
  }

  /**
   * Update memory metrics
   */
  private updateMemoryMetrics(): void {
    if (typeof window !== 'undefined' && 'performance' in window && 'memory' in window.performance) {
      const memory = (window.performance as any).memory
      this.metrics.memory.used = memory.usedJSHeapSize
      this.metrics.memory.total = memory.totalJSHeapSize
      this.metrics.memory.percentage = (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
    }
  }

  /**
   * Update timing metrics
   */
  private updateTimingMetrics(): void {
    if (typeof window !== 'undefined' && window.performance && window.performance.now) {
      this.metrics.timing.interactionTime = window.performance.now()
    }
  }

  /**
   * Clear all metrics (for testing)
   */
  clearMetrics(): void {
    this.aiMetrics = {
      libraryLoads: [],
      modelLoads: [],
      inferences: [],
      ttsLoads: [],
      cacheOps: []
    }
    this.metricsHistory = []

    // Clear localStorage if available
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('performance-metrics-history')
      } catch (error) {
        // Ignore localStorage errors
      }
    }
  }
}

export const performanceMonitor = new PerformanceMonitor()