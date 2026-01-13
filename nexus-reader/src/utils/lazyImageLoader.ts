/**
 * Lazy Image Loader - 图片懒加载工具
 * 使用 Intersection Observer 实现高性能图片懒加载
 */

import { adaptiveImageQuality } from './networkOptimizer'
// performanceMonitor is accessed via window.performanceMonitor for optional integration

// 懒加载配置
export interface LazyLoadConfig {
  rootMargin: string
  threshold: number
  enablePlaceholder: boolean
  enableProgressiveLoading: boolean
  enableRetry: boolean
  maxRetries: number
  retryDelay: number
  preloadDistance: number
}

// 图片状态
export type ImageLoadState = 'idle' | 'loading' | 'loaded' | 'error' | 'retrying'

// 图片信息接口
export interface LazyImageInfo {
  element: HTMLImageElement
  originalSrc: string
  optimizedSrc: string
  state: ImageLoadState
  retryCount: number
  loadStartTime: number
  loadEndTime: number
  placeholder?: string
  priority: number
}

/**
 * 懒加载图片管理器
 */
export class LazyImageLoader {
  private observer: IntersectionObserver | null = null
  private images = new Map<HTMLImageElement, LazyImageInfo>()
  private config: LazyLoadConfig
  private loadQueue: LazyImageInfo[] = []
  private isProcessingQueue = false

  constructor(config?: Partial<LazyLoadConfig>) {
    this.config = {
      rootMargin: '50px',
      threshold: 0.1,
      enablePlaceholder: true,
      enableProgressiveLoading: true,
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
      preloadDistance: 200,
      ...config
    }

    this.initializeObserver()
  }

  // 注册图片进行懒加载
  observe(img: HTMLImageElement, options?: {
    placeholder?: string
    priority?: number
    quality?: number
    maxWidth?: number
    maxHeight?: number
  }): void {
    if (this.images.has(img)) {
      console.warn('Image already being observed:', img.src)
      return
    }

    const originalSrc = img.dataset.src || img.src
    if (!originalSrc) {
      console.warn('No src or data-src found for image')
      return
    }

    // 优化图片URL
    const optimizedSrc = adaptiveImageQuality.optimizeImageUrl(originalSrc, {
      quality: options?.quality,
      maxWidth: options?.maxWidth,
      maxHeight: options?.maxHeight
    })

    const imageInfo: LazyImageInfo = {
      element: img,
      originalSrc,
      optimizedSrc,
      state: 'idle',
      retryCount: 0,
      loadStartTime: 0,
      loadEndTime: 0,
      placeholder: options?.placeholder,
      priority: options?.priority || 5
    }

    this.images.set(img, imageInfo)

    // 设置占位符
    if (this.config.enablePlaceholder) {
      this.setPlaceholder(imageInfo)
    }

    // 开始观察
    if (this.observer) {
      this.observer.observe(img)
    }

    console.log('🖼️ Image registered for lazy loading:', originalSrc)
  }

  // 停止观察图片
  unobserve(img: HTMLImageElement): void {
    if (this.observer) {
      this.observer.unobserve(img)
    }
    this.images.delete(img)
  }

  // 立即加载图片（跳过懒加载）
  async loadImmediately(img: HTMLImageElement): Promise<void> {
    const imageInfo = this.images.get(img)
    if (!imageInfo) {
      console.warn('Image not registered for lazy loading')
      return
    }

    await this.loadImage(imageInfo)
  }

  // 预加载图片列表
  async preloadImages(images: HTMLImageElement[]): Promise<void> {
    console.log(`🚀 Preloading ${images.length} images...`)

    const preloadPromises = images.map(async (img) => {
      const imageInfo = this.images.get(img)
      if (imageInfo && imageInfo.state === 'idle') {
        return this.loadImage(imageInfo)
      }
    })

    await Promise.all(preloadPromises)
    console.log('✅ Image preloading completed')
  }

  // 获取加载统计
  getLoadingStats(): {
    total: number
    loaded: number
    loading: number
    failed: number
    averageLoadTime: number
  } {
    const images = Array.from(this.images.values())
    const loaded = images.filter(img => img.state === 'loaded').length
    const loading = images.filter(img => img.state === 'loading').length
    const failed = images.filter(img => img.state === 'error').length
    
    const loadedImages = images.filter(img => img.state === 'loaded' && img.loadEndTime > 0)
    const averageLoadTime = loadedImages.length > 0
      ? loadedImages.reduce((sum, img) => sum + (img.loadEndTime - img.loadStartTime), 0) / loadedImages.length
      : 0

    return {
      total: images.length,
      loaded,
      loading,
      failed,
      averageLoadTime
    }
  }

  // 清理已加载的图片
  cleanup(): void {
    const imagesToRemove: HTMLImageElement[] = []
    
    for (const img of this.images.keys()) {
      // 移除已从DOM中删除的图片
      if (!document.contains(img)) {
        imagesToRemove.push(img)
      }
    }

    imagesToRemove.forEach(img => {
      this.unobserve(img)
    })

    console.log(`🧹 Cleaned up ${imagesToRemove.length} orphaned images`)
  }

  // 更新配置
  updateConfig(newConfig: Partial<LazyLoadConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // 重新初始化观察者
    this.destroyObserver()
    this.initializeObserver()
    
    // 重新观察所有图片
    for (const img of this.images.keys()) {
      if (this.observer) {
        this.observer.observe(img)
      }
    }

    console.log('⚙️ Lazy image loader config updated')
  }

  // 销毁懒加载器
  destroy(): void {
    this.destroyObserver()
    this.images.clear()
    this.loadQueue = []
  }

  private initializeObserver(): void {
    if (!('IntersectionObserver' in window)) {
      console.warn('IntersectionObserver not supported, falling back to immediate loading')
      return
    }

    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold
      }
    )

    console.log('👁️ Intersection Observer initialized for lazy loading')
  }

  private destroyObserver(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }

  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement
        const imageInfo = this.images.get(img)
        
        if (imageInfo && imageInfo.state === 'idle') {
          // 添加到加载队列
          this.addToLoadQueue(imageInfo)
          
          // 停止观察已进入视口的图片
          if (this.observer) {
            this.observer.unobserve(img)
          }
        }
      }
    })

    // 处理加载队列
    this.processLoadQueue()
  }

  private addToLoadQueue(imageInfo: LazyImageInfo): void {
    this.loadQueue.push(imageInfo)
    
    // 按优先级排序
    this.loadQueue.sort((a, b) => b.priority - a.priority)
  }

  private async processLoadQueue(): Promise<void> {
    if (this.isProcessingQueue || this.loadQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true

    try {
      // 并发加载多个图片（根据网络质量调整并发数）
      const concurrency = this.getConcurrency()
      
      while (this.loadQueue.length > 0) {
        const batch = this.loadQueue.splice(0, concurrency)
        
        const batchPromises = batch.map(imageInfo => 
          this.loadImage(imageInfo).catch(error => {
            console.warn('Image load failed in batch:', error)
          })
        )

        await Promise.all(batchPromises)

        // 批次间延迟
        if (this.loadQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
    } finally {
      this.isProcessingQueue = false
    }
  }

  private async loadImage(imageInfo: LazyImageInfo): Promise<void> {
    if (imageInfo.state !== 'idle' && imageInfo.state !== 'error') {
      return
    }

    imageInfo.state = 'loading'
    imageInfo.loadStartTime = performance.now()

    try {
      // 渐进式加载
      if (this.config.enableProgressiveLoading) {
        await this.loadProgressively(imageInfo)
      } else {
        await this.loadDirectly(imageInfo)
      }

      imageInfo.state = 'loaded'
      imageInfo.loadEndTime = performance.now()

      // 报告性能指标
      const loadTime = imageInfo.loadEndTime - imageInfo.loadStartTime
      if (window.performanceMonitor) {
        window.performanceMonitor.reportMetric('image_load_time', loadTime, {
          src: imageInfo.originalSrc,
          optimized: imageInfo.optimizedSrc !== imageInfo.originalSrc,
          retryCount: imageInfo.retryCount
        })
      }

      console.log(`✅ Image loaded: ${imageInfo.originalSrc} (${loadTime.toFixed(0)}ms)`)

    } catch (error) {
      console.error(`❌ Image load failed: ${imageInfo.originalSrc}`, error)
      
      imageInfo.state = 'error'
      
      // 重试机制
      if (this.config.enableRetry && imageInfo.retryCount < this.config.maxRetries) {
        await this.retryLoad(imageInfo)
      } else {
        this.setErrorPlaceholder(imageInfo)
      }
    }
  }

  private async loadProgressively(imageInfo: LazyImageInfo): Promise<void> {
    const img = imageInfo.element

    // 首先加载低质量版本（如果可用）
    const lowQualitySrc = adaptiveImageQuality.optimizeImageUrl(imageInfo.originalSrc, {
      quality: 30,
      maxWidth: 200,
      maxHeight: 200
    })

    if (lowQualitySrc !== imageInfo.optimizedSrc) {
      try {
        await this.loadImageSrc(img, lowQualitySrc)
        img.style.filter = 'blur(2px)'
      } catch (error) {
        // 低质量版本加载失败，直接加载原图
      }
    }

    // 然后加载优化后的版本
    await this.loadImageSrc(img, imageInfo.optimizedSrc)
    
    // 移除模糊效果
    img.style.filter = ''
    img.style.transition = 'filter 0.3s ease'
  }

  private async loadDirectly(imageInfo: LazyImageInfo): Promise<void> {
    await this.loadImageSrc(imageInfo.element, imageInfo.optimizedSrc)
  }

  private loadImageSrc(img: HTMLImageElement, src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tempImg = new Image()
      
      tempImg.onload = () => {
        img.src = src
        img.style.opacity = '1'
        resolve()
      }

      tempImg.onerror = () => {
        reject(new Error('Image load failed'))
      }

      tempImg.src = src
    })
  }

  private async retryLoad(imageInfo: LazyImageInfo): Promise<void> {
    imageInfo.retryCount++
    imageInfo.state = 'retrying'

    console.log(`🔄 Retrying image load (attempt ${imageInfo.retryCount}): ${imageInfo.originalSrc}`)

    // 指数退避延迟
    const delay = this.config.retryDelay * Math.pow(2, imageInfo.retryCount - 1)
    await new Promise(resolve => setTimeout(resolve, delay))

    // 重新尝试加载
    imageInfo.state = 'idle'
    await this.loadImage(imageInfo)
  }

  private setPlaceholder(imageInfo: LazyImageInfo): void {
    const img = imageInfo.element
    
    if (imageInfo.placeholder) {
      img.src = imageInfo.placeholder
    } else {
      // 生成默认占位符
      const width = img.width || 300
      const height = img.height || 200
      const placeholderSrc = this.generatePlaceholder(width, height)
      img.src = placeholderSrc
    }

    img.style.opacity = '0.7'
    img.style.transition = 'opacity 0.3s ease'
  }

  private setErrorPlaceholder(imageInfo: LazyImageInfo): void {
    const img = imageInfo.element
    const width = img.width || 300
    const height = img.height || 200
    
    // 生成错误占位符
    const errorSrc = this.generateErrorPlaceholder(width, height)
    img.src = errorSrc
    img.style.opacity = '0.5'
  }

  private generatePlaceholder(width: number, height: number): string {
    // 生成简单的SVG占位符
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999" font-family="Arial, sans-serif" font-size="14">
          加载中...
        </text>
      </svg>
    `
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  private generateErrorPlaceholder(width: number, height: number): string {
    // 生成错误占位符
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f8f8f8"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#ccc" font-family="Arial, sans-serif" font-size="14">
          加载失败
        </text>
      </svg>
    `
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  private getConcurrency(): number {
    // 根据网络质量和设备性能调整并发数
    const connection = (navigator as any).connection
    
    if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return 1
    } else if (connection?.effectiveType === '3g') {
      return 2
    } else {
      return 4
    }
  }
}

// 全局懒加载器实例
export const lazyImageLoader = new LazyImageLoader()

// 自动清理
if (typeof window !== 'undefined') {
  // 定期清理
  setInterval(() => {
    lazyImageLoader.cleanup()
  }, 2 * 60 * 1000) // 每2分钟清理一次

  // 页面卸载时销毁
  window.addEventListener('beforeunload', () => {
    lazyImageLoader.destroy()
  })
}

// 便捷函数
export function observeImage(
  img: HTMLImageElement, 
  options?: {
    placeholder?: string
    priority?: number
    quality?: number
    maxWidth?: number
    maxHeight?: number
  }
): void {
  lazyImageLoader.observe(img, options)
}

export function unobserveImage(img: HTMLImageElement): void {
  lazyImageLoader.unobserve(img)
}

export function preloadImages(images: HTMLImageElement[]): Promise<void> {
  return lazyImageLoader.preloadImages(images)
}

export function getImageLoadingStats() {
  return lazyImageLoader.getLoadingStats()
}

// Vue 指令支持
export const vLazyImage = {
  mounted(el: HTMLImageElement, binding: any) {
    observeImage(el, binding.value)
  },
  unmounted(el: HTMLImageElement) {
    unobserveImage(el)
  }
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}