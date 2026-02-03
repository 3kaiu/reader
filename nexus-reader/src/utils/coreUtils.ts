/**
 * 核心工具函数库 - Core Utilities
 * 合并常用的工具函数，避免重复代码
 */

import { ref, reactive, computed, watch, nextTick } from 'vue'
import { logger } from './logger'

// ===== 设备检测工具 =====

export class DeviceDetector {
  private static instance: DeviceDetector
  private deviceInfo = reactive({
    type: 'desktop' as 'mobile' | 'tablet' | 'desktop' | 'tv',
    screenSize: { width: 1920, height: 1080 },
    pixelRatio: 1,
    touchSupport: false,
    orientation: 'landscape' as 'portrait' | 'landscape',
    connectionType: 'wifi' as 'wifi' | 'mobile' | 'offline',
    batteryLevel: 100,
    memoryAvailable: 8 * 1024 * 1024 * 1024, // 8GB
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
    platform: 'unknown'
  })

  static getInstance(): DeviceDetector {
    if (!DeviceDetector.instance) {
      DeviceDetector.instance = new DeviceDetector()
    }
    return DeviceDetector.instance
  }

  get info() {
    return readonly(this.deviceInfo)
  }

  updateScreenInfo(): void {
    this.deviceInfo.screenSize = {
      width: window.innerWidth,
      height: window.innerHeight
    }
    this.deviceInfo.orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
    this.deviceInfo.pixelRatio = window.devicePixelRatio || 1
  }

  detectDeviceType(): void {
    const ua = navigator.userAgent.toLowerCase()
    const width = window.innerWidth

    if (ua.includes('mobile') || width < 768) {
      this.deviceInfo.type = 'mobile'
    } else if (ua.includes('tablet') || (width >= 768 && width < 1200)) {
      this.deviceInfo.type = 'tablet'
    } else if (width >= 1200) {
      this.deviceInfo.type = 'desktop'
    } else {
      this.deviceInfo.type = 'tv'
    }

    this.deviceInfo.touchSupport = 'ontouchstart' in window
    this.deviceInfo.language = navigator.language
    this.deviceInfo.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    this.deviceInfo.platform = navigator.platform
  }

  detectConnectionType(): void {
    const connection = (navigator as any).connection
    if (connection) {
      switch (connection.effectiveType) {
        case '4g':
        case '3g':
          this.deviceInfo.connectionType = 'mobile'
          break
        case '2g':
        case 'slow-2g':
          this.deviceInfo.connectionType = 'offline'
          break
        default:
          this.deviceInfo.connectionType = 'wifi'
      }
    }
  }

  detectBattery(): void {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.deviceInfo.batteryLevel = Math.round(battery.level * 100)

        battery.addEventListener('levelchange', () => {
          this.deviceInfo.batteryLevel = Math.round(battery.level * 100)
        })
      })
    }
  }

  setupEventListeners(): void {
    // 屏幕尺寸变化
    window.addEventListener('resize', () => {
      this.updateScreenInfo()
    })

    // 方向变化
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.updateScreenInfo(), 100)
    })

    // 连接变化
    if ((navigator as any).connection) {
      (navigator as any).connection.addEventListener('change', () => {
        this.detectConnectionType()
      })
    }
  }

  init(): void {
    this.detectDeviceType()
    this.updateScreenInfo()
    this.detectConnectionType()
    this.detectBattery()
    this.setupEventListeners()
  }
}

// ===== 性能监控工具 =====

export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics = reactive({
    // 页面性能
    pageLoadTime: 0,
    firstPaint: 0,
    largestContentfulPaint: 0,
    firstInputDelay: 0,

    // 内存使用
    memoryUsage: 0,
    memoryLimit: 0,

    // 网络请求
    requestCount: 0,
    failedRequests: 0,
    averageResponseTime: 0,

    // 用户交互
    clickCount: 0,
    scrollDepth: 0,
    timeOnPage: 0
  })

  private observers: PerformanceObserver[] = []

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  get data() {
    return readonly(this.metrics)
  }

  init(): void {
    this.observePageLoad()
    this.observePaint()
    this.observeMemory()
    this.observeNetwork()
    this.observeInteractions()
  }

  private observePageLoad(): void {
    if ('performance' in window) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      if (navigation) {
        this.metrics.pageLoadTime = navigation.loadEventEnd - navigation.fetchStart
      }
    }
  }

  private observePaint(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-paint') {
            this.metrics.firstPaint = entry.startTime
          } else if (entry.name === 'largest-contentful-paint') {
            this.metrics.largestContentfulPaint = entry.startTime
          }
        }
      })
      observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] })
      this.observers.push(observer)
    } catch (e) {
      logger.warn('Performance observer not supported')
    }
  }

  private observeMemory(): void {
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory
        this.metrics.memoryUsage = memory.usedJSHeapSize
        this.metrics.memoryLimit = memory.jsHeapSizeLimit
      }, 5000)
    }
  }

  private observeNetwork(): void {
    // 拦截 fetch 和 XMLHttpRequest
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const startTime = Date.now()
      this.metrics.requestCount++

      try {
        const response = await originalFetch(...args)
        const duration = Date.now() - startTime
        this.updateAverageResponseTime(duration)
        return response
      } catch (error) {
        this.metrics.failedRequests++
        throw error
      }
    }
  }

  private observeInteractions(): void {
    let lastClickTime = 0

    // 点击事件
    document.addEventListener('click', () => {
      this.metrics.clickCount++
      lastClickTime = Date.now()
    }, true)

    // 滚动深度
    let maxScrollDepth = 0
    window.addEventListener('scroll', () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const windowHeight = window.innerHeight
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )

      const scrollDepth = Math.round((scrollTop + windowHeight) / docHeight * 100)
      maxScrollDepth = Math.max(maxScrollDepth, scrollDepth)
      this.metrics.scrollDepth = maxScrollDepth
    })

    // 页面停留时间
    let startTime = Date.now()
    window.addEventListener('beforeunload', () => {
      this.metrics.timeOnPage = Date.now() - startTime
    })

    // FID (First Input Delay)
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.metrics.firstInputDelay = (entry as any).processingStart - entry.startTime
        }
      })
      observer.observe({ entryTypes: ['first-input'] })
      this.observers.push(observer)
    } catch (e) {
      // FID not supported
    }
  }

  private updateAverageResponseTime(duration: number): void {
    const totalTime = this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + duration
    this.metrics.averageResponseTime = totalTime / this.metrics.requestCount
  }

  recordCustomMetric(name: string, value: number): void {
    (this.metrics as any)[name] = value
  }

  getReport(): Record<string, any> {
    return {
      ...this.metrics,
      deviceInfo: DeviceDetector.getInstance().info,
      timestamp: new Date().toISOString()
    }
  }

  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
  }
}

// ===== 数据格式化工具 =====

export class DataFormatter {
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  static formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`

    const seconds = ms / 1000
    if (seconds < 60) return `${seconds.toFixed(1)}s`

    const minutes = seconds / 60
    if (minutes < 60) return `${minutes.toFixed(1)}m`

    const hours = minutes / 60
    return `${hours.toFixed(1)}h`
  }

  static formatNumber(num: number): string {
    if (num < 1000) return num.toString()
    if (num < 1000000) return `${(num / 1000).toFixed(1)}K`
    return `${(num / 1000000).toFixed(1)}M`
  }

  static formatPercentage(value: number, total: number): string {
    if (total === 0) return '0%'
    return `${((value / total) * 100).toFixed(1)}%`
  }

  static formatDate(date: Date | string | number): string {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    if (days < 30) return `${Math.floor(days / 7)}周前`

    return d.toLocaleDateString('zh-CN')
  }

  static formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }
}

// ===== 本地存储工具 =====

export class LocalStorage {
  private prefix: string

  constructor(prefix = 'nexus_') {
    this.prefix = prefix
  }

  get<T>(key: string, defaultValue?: T): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key)
      if (item === null) return defaultValue || null
      return JSON.parse(item)
    } catch (error) {
      logger.error('LocalStorage get error:', error)
      return defaultValue || null
    }
  }

  set(key: string, value: any): boolean {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value))
      return true
    } catch (error) {
      logger.error('LocalStorage set error:', error)
      return false
    }
  }

  remove(key: string): boolean {
    try {
      localStorage.removeItem(this.prefix + key)
      return true
    } catch (error) {
      logger.error('LocalStorage remove error:', error)
      return false
    }
  }

  clear(): boolean {
    try {
      // 只清除带有前缀的项目
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key)
        }
      })
      return true
    } catch (error) {
      logger.error('LocalStorage clear error:', error)
      return false
    }
  }

  has(key: string): boolean {
    return localStorage.getItem(this.prefix + key) !== null
  }

  keys(): string[] {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length))
      }
    }
    return keys
  }
}

// ===== 防抖节流工具 =====

export class DebounceThrottle {
  private timeouts = new Map<string, NodeJS.Timeout>()
  private lastExecutions = new Map<string, number>()

  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    key = 'default'
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      const existing = this.timeouts.get(key)
      if (existing) {
        clearTimeout(existing)
      }

      this.timeouts.set(key, setTimeout(() => {
        func(...args)
        this.timeouts.delete(key)
      }, wait))
    }
  }

  throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number,
    key = 'default'
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      const now = Date.now()
      const lastExecution = this.lastExecutions.get(key) || 0

      if (now - lastExecution >= limit) {
        func(...args)
        this.lastExecutions.set(key, now)
      }
    }
  }

  cancel(key = 'default'): void {
    const timeout = this.timeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(key)
    }
  }

  cancelAll(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout))
    this.timeouts.clear()
    this.lastExecutions.clear()
  }
}

// ===== 全局实例 =====

export const deviceDetector = DeviceDetector.getInstance()
export const performanceMonitor = PerformanceMonitor.getInstance()
export const dataFormatter = DataFormatter
export const localStorage = new LocalStorage()
export const debounceThrottle = new DebounceThrottle()

// ===== 初始化 =====

export function initCoreUtils(): void {
  deviceDetector.init()
  performanceMonitor.init()
  logger.info('Core utilities initialized')
}

// ===== Vue 插件 =====

export const coreUtilsPlugin = {
  install(app: any) {
    app.config.globalProperties.$device = deviceDetector
    app.config.globalProperties.$performance = performanceMonitor
    app.config.globalProperties.$format = dataFormatter
    app.config.globalProperties.$storage = localStorage
    app.provide('device', deviceDetector)
    app.provide('performance', performanceMonitor)
    app.provide('format', dataFormatter)
    app.provide('storage', localStorage)
  }
}