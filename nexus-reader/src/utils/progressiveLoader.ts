/**
 * Progressive Loader - 渐进式加载系统
 * 提供有意义的加载状态和渐进式资源加载
 */

import { networkDetector } from './networkOptimizer'
// performanceMonitor is accessed via window.performanceMonitor for optional integration

// 加载状态类型
export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error' | 'timeout'

// 加载优先级
export type LoadingPriority = 'critical' | 'high' | 'medium' | 'low'

// 资源类型
export type ResourceType = 'script' | 'style' | 'image' | 'font' | 'data' | 'component'

// 加载项接口
export interface LoadingItem {
  id: string
  type: ResourceType
  url: string
  priority: LoadingPriority
  timeout: number
  retries: number
  dependencies?: string[]
  metadata?: any
}

// 加载结果接口
export interface LoadingResult {
  id: string
  success: boolean
  data?: any
  error?: Error
  loadTime: number
  fromCache: boolean
}

// 加载状态接口
export interface LoadingStatus {
  state: LoadingState
  progress: number
  message: string
  details?: any
}

// 预加载策略接口
export interface PreloadStrategy {
  enabled: boolean
  maxConcurrency: number
  networkThreshold: 'good' | 'fair' | 'poor'
  cacheFirst: boolean
  prefetchOnHover: boolean
  prefetchOnVisible: boolean
}

/**
 * 渐进式加载管理器
 */
export class ProgressiveLoader {
  private loadingQueue: LoadingItem[] = []
  private loadingResults = new Map<string, LoadingResult>()
  private loadingStates = new Map<string, LoadingStatus>()
  private activeLoads = new Map<string, Promise<LoadingResult>>()
  private listeners = new Map<string, Array<(status: LoadingStatus) => void>>()
  private preloadStrategy: PreloadStrategy
  private intersectionObserver?: IntersectionObserver

  constructor(strategy?: Partial<PreloadStrategy>) {
    this.preloadStrategy = {
      enabled: true,
      maxConcurrency: 6,
      networkThreshold: 'fair',
      cacheFirst: true,
      prefetchOnHover: true,
      prefetchOnVisible: true,
      ...strategy
    }

    this.initializeObservers()
  }

  // 添加加载项
  addLoadingItem(item: LoadingItem): void {
    // 检查是否已存在
    if (this.loadingStates.has(item.id)) {
      console.warn(`Loading item already exists: ${item.id}`)
      return
    }

    this.loadingQueue.push(item)
    this.setLoadingState(item.id, {
      state: 'idle',
      progress: 0,
      message: '等待加载...'
    })

    console.log(`📦 Added loading item: ${item.type}/${item.id} (priority: ${item.priority})`)
  }

  // 开始加载
  async startLoading(id: string): Promise<LoadingResult> {
    // 检查是否已在加载中
    if (this.activeLoads.has(id)) {
      return this.activeLoads.get(id)!
    }

    const item = this.loadingQueue.find(item => item.id === id)
    if (!item) {
      throw new Error(`Loading item not found: ${id}`)
    }

    // 检查依赖
    if (item.dependencies) {
      await this.loadDependencies(item.dependencies)
    }

    // 创建加载Promise
    const loadPromise = this.performLoad(item)
    this.activeLoads.set(id, loadPromise)

    try {
      const result = await loadPromise
      this.loadingResults.set(id, result)
      
      this.setLoadingState(id, {
        state: result.success ? 'loaded' : 'error',
        progress: 100,
        message: result.success ? '加载完成' : `加载失败: ${result.error?.message}`,
        details: result
      })

      return result
    } finally {
      this.activeLoads.delete(id)
    }
  }

  // 批量加载
  async loadBatch(ids: string[]): Promise<LoadingResult[]> {
    const networkQuality = networkDetector.getNetworkQuality()
    const concurrency = this.getConcurrencyForNetwork(networkQuality)

    console.log(`📦 Starting batch load of ${ids.length} items (concurrency: ${concurrency})`)

    const results: LoadingResult[] = []
    
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency)
      
      const batchPromises = batch.map(id => 
        this.startLoading(id).catch(error => ({
          id,
          success: false,
          error,
          loadTime: 0,
          fromCache: false
        } as LoadingResult))
      )

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // 批次间延迟
      if (i + concurrency < ids.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return results
  }

  // 预加载资源
  async preloadResources(items: LoadingItem[]): Promise<void> {
    if (!this.preloadStrategy.enabled) return

    const networkQuality = networkDetector.getNetworkQuality()
    if (!this.shouldPreload(networkQuality)) return

    console.log(`🚀 Preloading ${items.length} resources...`)

    // 按优先级排序
    const sortedItems = items.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })

    // 添加到队列
    sortedItems.forEach(item => this.addLoadingItem(item))

    // 开始预加载
    const preloadIds = sortedItems.map(item => item.id)
    await this.loadBatch(preloadIds)

    console.log('✅ Preloading completed')
  }

  // 智能预加载（基于用户行为）
  enableSmartPreloading(): void {
    if (!this.preloadStrategy.prefetchOnHover && !this.preloadStrategy.prefetchOnVisible) {
      return
    }

    // 鼠标悬停预加载
    if (this.preloadStrategy.prefetchOnHover) {
      this.enableHoverPreloading()
    }

    // 可见性预加载
    if (this.preloadStrategy.prefetchOnVisible) {
      this.enableVisibilityPreloading()
    }

    console.log('🧠 Smart preloading enabled')
  }

  // 获取加载状态
  getLoadingState(id: string): LoadingStatus | null {
    return this.loadingStates.get(id) || null
  }

  // 获取加载结果
  getLoadingResult(id: string): LoadingResult | null {
    return this.loadingResults.get(id) || null
  }

  // 添加状态监听器
  addStatusListener(id: string, listener: (status: LoadingStatus) => void): void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, [])
    }
    this.listeners.get(id)!.push(listener)
  }

  // 移除状态监听器
  removeStatusListener(id: string, listener: (status: LoadingStatus) => void): void {
    const listeners = this.listeners.get(id)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  // 清理已完成的加载项
  cleanup(): void {
    const now = Date.now()
    const maxAge = 5 * 60 * 1000 // 5分钟

    for (const [id, result] of this.loadingResults.entries()) {
      if (now - result.loadTime > maxAge) {
        this.loadingResults.delete(id)
        this.loadingStates.delete(id)
        this.listeners.delete(id)
      }
    }

    console.log('🧹 Progressive loader cleanup completed')
  }

  // 获取加载统计
  getLoadingStats(): {
    total: number
    loaded: number
    failed: number
    loading: number
    averageLoadTime: number
  } {
    const results = Array.from(this.loadingResults.values())
    const states = Array.from(this.loadingStates.values())

    const loaded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const loading = states.filter(s => s.state === 'loading').length
    const averageLoadTime = results.length > 0 
      ? results.reduce((sum, r) => sum + r.loadTime, 0) / results.length 
      : 0

    return {
      total: this.loadingQueue.length,
      loaded,
      failed,
      loading,
      averageLoadTime
    }
  }

  private async performLoad(item: LoadingItem): Promise<LoadingResult> {
    const startTime = performance.now()
    
    this.setLoadingState(item.id, {
      state: 'loading',
      progress: 10,
      message: '开始加载...'
    })

    try {
      // 检查缓存
      if (this.preloadStrategy.cacheFirst) {
        const cached = await this.checkCache(item)
        if (cached) {
          const loadTime = performance.now() - startTime
          return {
            id: item.id,
            success: true,
            data: cached,
            loadTime,
            fromCache: true
          }
        }
      }

      // 根据类型执行不同的加载策略
      const data = await this.loadByType(item)
      const loadTime = performance.now() - startTime

      // 报告性能指标
      if (window.performanceMonitor) {
        window.performanceMonitor.reportMetric('resource_load_time', loadTime, {
          type: item.type,
          priority: item.priority,
          fromCache: false
        })
      }

      return {
        id: item.id,
        success: true,
        data,
        loadTime,
        fromCache: false
      }

    } catch (error) {
      const loadTime = performance.now() - startTime
      
      console.error(`❌ Failed to load ${item.type}/${item.id}:`, error)
      
      return {
        id: item.id,
        success: false,
        error: error as Error,
        loadTime,
        fromCache: false
      }
    }
  }

  private async loadByType(item: LoadingItem): Promise<any> {
    this.setLoadingState(item.id, {
      state: 'loading',
      progress: 30,
      message: `加载${item.type}...`
    })

    switch (item.type) {
      case 'script':
        return this.loadScript(item)
      case 'style':
        return this.loadStyle(item)
      case 'image':
        return this.loadImage(item)
      case 'font':
        return this.loadFont(item)
      case 'data':
        return this.loadData(item)
      case 'component':
        return this.loadComponent(item)
      default:
        throw new Error(`Unsupported resource type: ${item.type}`)
    }
  }

  private async loadScript(item: LoadingItem): Promise<HTMLScriptElement> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = item.url
      script.async = true
      
      const timeout = setTimeout(() => {
        reject(new Error('Script load timeout'))
      }, item.timeout)

      script.onload = () => {
        clearTimeout(timeout)
        resolve(script)
      }

      script.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Script load failed'))
      }

      document.head.appendChild(script)
    })
  }

  private async loadStyle(item: LoadingItem): Promise<HTMLLinkElement> {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = item.url
      
      const timeout = setTimeout(() => {
        reject(new Error('Style load timeout'))
      }, item.timeout)

      link.onload = () => {
        clearTimeout(timeout)
        resolve(link)
      }

      link.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Style load failed'))
      }

      document.head.appendChild(link)
    })
  }

  private async loadImage(item: LoadingItem): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      
      const timeout = setTimeout(() => {
        reject(new Error('Image load timeout'))
      }, item.timeout)

      img.onload = () => {
        clearTimeout(timeout)
        resolve(img)
      }

      img.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Image load failed'))
      }

      img.src = item.url
    })
  }

  private async loadFont(item: LoadingItem): Promise<FontFace> {
    if (!('FontFace' in window)) {
      throw new Error('FontFace API not supported')
    }

    const fontName = item.metadata?.name || 'CustomFont'
    const fontFace = new FontFace(fontName, `url(${item.url})`)
    
    await fontFace.load()
    document.fonts.add(fontFace)
    
    return fontFace
  }

  private async loadData(item: LoadingItem): Promise<any> {
    const response = await fetch(item.url, {
      signal: AbortSignal.timeout(item.timeout)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json()
    } else {
      return response.text()
    }
  }

  private async loadComponent(item: LoadingItem): Promise<any> {
    // 动态导入组件
    const module = await import(/* @vite-ignore */ item.url)
    return module.default || module
  }

  private async checkCache(item: LoadingItem): Promise<any> {
    // 检查浏览器缓存
    if ('caches' in window) {
      try {
        const cache = await caches.open('progressive-loader')
        const response = await cache.match(item.url)
        if (response) {
          return response.clone()
        }
      } catch (error) {
        console.warn('Cache check failed:', error)
      }
    }
    return null
  }

  private async loadDependencies(dependencies: string[]): Promise<void> {
    const dependencyPromises = dependencies.map(depId => {
      const existingResult = this.loadingResults.get(depId)
      if (existingResult) {
        return Promise.resolve(existingResult)
      }
      return this.startLoading(depId)
    })

    await Promise.all(dependencyPromises)
  }

  private setLoadingState(id: string, status: LoadingStatus): void {
    this.loadingStates.set(id, status)
    
    // 通知监听器
    const listeners = this.listeners.get(id)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(status)
        } catch (error) {
          console.error('Loading status listener error:', error)
        }
      })
    }
  }

  private getConcurrencyForNetwork(networkQuality: string): number {
    const concurrencyMap = {
      'excellent': 8,
      'good': 6,
      'fair': 4,
      'poor': 2,
      'offline': 1
    }
    return concurrencyMap[networkQuality as keyof typeof concurrencyMap] || 4
  }

  private shouldPreload(networkQuality: string): boolean {
    const qualityOrder = ['excellent', 'good', 'fair', 'poor', 'offline']
    const currentIndex = qualityOrder.indexOf(networkQuality)
    const thresholdIndex = qualityOrder.indexOf(this.preloadStrategy.networkThreshold)
    
    return currentIndex <= thresholdIndex
  }

  private initializeObservers(): void {
    // 初始化 Intersection Observer
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        this.handleIntersection.bind(this),
        { threshold: 0.1 }
      )
    }
  }

  private enableHoverPreloading(): void {
    document.addEventListener('mouseover', (event) => {
      const target = event.target as HTMLElement
      const preloadUrl = target.dataset.preload
      
      if (preloadUrl) {
        this.addLoadingItem({
          id: `hover_${Date.now()}`,
          type: 'data',
          url: preloadUrl,
          priority: 'low',
          timeout: 5000,
          retries: 1
        })
      }
    })
  }

  private enableVisibilityPreloading(): void {
    if (!this.intersectionObserver) return

    // 观察所有带有 data-preload-visible 属性的元素
    const preloadElements = document.querySelectorAll('[data-preload-visible]')
    preloadElements.forEach(element => {
      this.intersectionObserver!.observe(element)
    })
  }

  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target as HTMLElement
        const preloadUrl = element.dataset.preloadVisible
        
        if (preloadUrl) {
          this.addLoadingItem({
            id: `visible_${Date.now()}`,
            type: 'data',
            url: preloadUrl,
            priority: 'medium',
            timeout: 10000,
            retries: 2
          })
        }

        // 停止观察已处理的元素
        this.intersectionObserver!.unobserve(element)
      }
    })
  }
}

// 全局渐进式加载器实例
export const progressiveLoader = new ProgressiveLoader()

// 自动启用智能预加载
if (typeof window !== 'undefined') {
  // 页面加载完成后启用
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      progressiveLoader.enableSmartPreloading()
    })
  } else {
    progressiveLoader.enableSmartPreloading()
  }

  // 定期清理
  setInterval(() => {
    progressiveLoader.cleanup()
  }, 5 * 60 * 1000) // 每5分钟清理一次
}

// 便捷函数
export function loadResource(item: LoadingItem): Promise<LoadingResult> {
  progressiveLoader.addLoadingItem(item)
  return progressiveLoader.startLoading(item.id)
}

export function preloadResources(items: LoadingItem[]): Promise<void> {
  return progressiveLoader.preloadResources(items)
}

export function getLoadingProgress(id: string): LoadingStatus | null {
  return progressiveLoader.getLoadingState(id)
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}