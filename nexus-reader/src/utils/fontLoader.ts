/**
 * Font Loader - 字体加载优化
 * 防止布局偏移并优化字体加载性能
 */

// 字体配置
export interface FontConfig {
  family: string
  weight?: string | number
  style?: 'normal' | 'italic' | 'oblique'
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
  unicodeRange?: string
  src: string | string[]
}

// 字体加载状态
export type FontLoadingState = 'unloaded' | 'loading' | 'loaded' | 'error'

// 字体实例
export interface FontInstance {
  config: FontConfig
  state: FontLoadingState
  loadTime?: number
  error?: Error
  fontFace?: FontFace
}

// 字体加载选项
export interface FontLoadOptions {
  timeout?: number
  preload?: boolean
  critical?: boolean
  fallback?: string[]
  enableOptimization?: boolean
}

/**
 * 字体加载管理器
 */
export class FontLoader {
  private fonts = new Map<string, FontInstance>()
  private loadingPromises = new Map<string, Promise<void>>()
  private observer?: IntersectionObserver
  private preloadedFonts = new Set<string>()

  constructor() {
    this.initializeFontDisplay()
    this.setupFontLoadingOptimization()
  }

  // 注册字体
  registerFont(config: FontConfig, options?: FontLoadOptions): void {
    const key = this.getFontKey(config)
    
    if (this.fonts.has(key)) {
      console.warn(`Font ${key} already registered`)
      return
    }

    const instance: FontInstance = {
      config,
      state: 'unloaded'
    }

    this.fonts.set(key, instance)

    // 如果是关键字体，立即预加载
    if (options?.critical || options?.preload) {
      this.preloadFont(key, options)
    }
  }

  // 加载字体
  async loadFont(
    family: string, 
    weight?: string | number, 
    style?: string,
    options?: FontLoadOptions
  ): Promise<void> {
    const key = this.getFontKey({ family, weight, style })
    const instance = this.fonts.get(key)

    if (!instance) {
      throw new Error(`Font ${key} not registered`)
    }

    // 如果已经加载或正在加载，返回现有Promise
    if (instance.state === 'loaded') {
      return Promise.resolve()
    }

    if (instance.state === 'loading') {
      return this.loadingPromises.get(key) || Promise.resolve()
    }

    // 开始加载
    const loadPromise = this.performFontLoad(instance, options)
    this.loadingPromises.set(key, loadPromise)

    return loadPromise
  }

  // 预加载字体
  async preloadFont(key: string, options?: FontLoadOptions): Promise<void> {
    if (this.preloadedFonts.has(key)) {
      return
    }

    const instance = this.fonts.get(key)
    if (!instance) {
      return
    }

    this.preloadedFonts.add(key)

    try {
      // 创建预加载链接
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'font'
      link.type = 'font/woff2'
      link.crossOrigin = 'anonymous'
      
      if (Array.isArray(instance.config.src)) {
        link.href = instance.config.src[0]
      } else {
        link.href = instance.config.src
      }

      document.head.appendChild(link)

      // 同时使用FontFace API预加载
      await this.loadFont(
        instance.config.family,
        instance.config.weight,
        instance.config.style,
        { ...options, timeout: 3000 }
      )

    } catch (error) {
      console.warn(`Font preload failed for ${key}:`, error)
    }
  }

  // 批量加载字体
  async loadFonts(fontKeys: string[], options?: FontLoadOptions): Promise<void[]> {
    const loadPromises = fontKeys.map(key => {
      const instance = this.fonts.get(key)
      if (instance) {
        return this.loadFont(
          instance.config.family,
          instance.config.weight,
          instance.config.style,
          options
        )
      }
      return Promise.resolve()
    })

    return Promise.all(loadPromises)
  }

  // 获取字体加载状态
  getFontState(family: string, weight?: string | number, style?: string): FontLoadingState {
    const key = this.getFontKey({ family, weight, style })
    const instance = this.fonts.get(key)
    return instance?.state || 'unloaded'
  }

  // 检查字体是否可用
  isFontAvailable(family: string, weight?: string | number, style?: string): boolean {
    const key = this.getFontKey({ family, weight, style })
    const instance = this.fonts.get(key)
    return instance?.state === 'loaded'
  }

  // 获取所有字体状态
  getAllFontStates(): Record<string, FontLoadingState> {
    const states: Record<string, FontLoadingState> = {}
    for (const [key, instance] of this.fonts.entries()) {
      states[key] = instance.state
    }
    return states
  }

  // 优化字体加载
  optimizeFontLoading(): void {
    // 预加载关键字体
    this.preloadCriticalFonts()
    
    // 设置字体显示策略
    this.setupFontDisplayStrategy()
    
    // 启用字体加载监控
    this.enableFontLoadingMonitoring()
  }

  // 清理未使用的字体
  cleanupUnusedFonts(): void {
    const usedFonts = this.getUsedFonts()
    
    for (const [key, instance] of this.fonts.entries()) {
      if (!usedFonts.has(key) && instance.state === 'loaded') {
        // 从字体集合中移除
        if (instance.fontFace) {
          document.fonts.delete(instance.fontFace)
        }
        this.fonts.delete(key)
      }
    }
  }

  private async performFontLoad(instance: FontInstance, options?: FontLoadOptions): Promise<void> {
    const startTime = performance.now()
    instance.state = 'loading'

    try {
      // 创建FontFace对象
      const fontFace = new FontFace(
        instance.config.family,
        this.getFontSource(instance.config.src),
        {
          weight: instance.config.weight?.toString() || 'normal',
          style: instance.config.style || 'normal',
          display: instance.config.display || 'swap',
          unicodeRange: instance.config.unicodeRange
        }
      )

      instance.fontFace = fontFace

      // 设置超时
      const timeout = options?.timeout || 3000
      const loadPromise = fontFace.load()
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Font load timeout')), timeout)
      })

      // 等待加载完成或超时
      await Promise.race([loadPromise, timeoutPromise])

      // 添加到文档字体集合
      document.fonts.add(fontFace)

      instance.state = 'loaded'
      instance.loadTime = performance.now() - startTime

      // 报告性能指标
      if (window.performanceMonitor) {
        window.performanceMonitor.reportMetric('font_load_time', instance.loadTime, {
          family: instance.config.family,
          weight: instance.config.weight,
          critical: options?.critical || false
        })
      }

      console.log(`✅ Font loaded: ${this.getFontKey(instance.config)} (${Math.round(instance.loadTime)}ms)`)

    } catch (error) {
      instance.state = 'error'
      instance.error = error as Error

      console.error(`❌ Font load failed: ${this.getFontKey(instance.config)}`, error)

      // 应用回退字体
      if (options?.fallback) {
        this.applyFallbackFonts(instance.config.family, options.fallback)
      }
    }
  }

  private getFontSource(src: string | string[]): string {
    if (Array.isArray(src)) {
      // 优先使用WOFF2格式
      const woff2 = src.find(s => s.includes('.woff2'))
      if (woff2) return `url(${woff2})`
      
      // 然后是WOFF
      const woff = src.find(s => s.includes('.woff'))
      if (woff) return `url(${woff})`
      
      // 最后使用第一个
      return `url(${src[0]})`
    }
    
    return `url(${src})`
  }

  private getFontKey(config: Partial<FontConfig>): string {
    const family = config.family || 'unknown'
    const weight = config.weight || 'normal'
    const style = config.style || 'normal'
    return `${family}-${weight}-${style}`
  }

  private initializeFontDisplay(): void {
    // 设置默认字体显示策略
    const style = document.createElement('style')
    style.textContent = `
      @font-face {
        font-display: swap;
      }
    `
    document.head.appendChild(style)
  }

  private setupFontLoadingOptimization(): void {
    // 监听字体加载事件
    if ('fonts' in document) {
      document.fonts.addEventListener('loadingdone', () => {
        console.log('All fonts loaded')
      })

      document.fonts.addEventListener('loadingerror', (event) => {
        console.error('Font loading error:', event)
      })
    }

    // 预连接到字体CDN
    this.preconnectToFontCDNs()
  }

  private preconnectToFontCDNs(): void {
    const cdns = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://use.typekit.net'
    ]

    cdns.forEach(cdn => {
      const link = document.createElement('link')
      link.rel = 'preconnect'
      link.href = cdn
      link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
    })
  }

  private preloadCriticalFonts(): void {
    // 预加载关键字体（通常是正文字体）
    const criticalFonts = Array.from(this.fonts.entries())
      .filter(([_, instance]) => instance.config.family.includes('sans-serif') || 
                                 instance.config.family.includes('serif'))
      .slice(0, 2) // 限制数量

    criticalFonts.forEach(([key]) => {
      this.preloadFont(key, { critical: true })
    })
  }

  private setupFontDisplayStrategy(): void {
    // 为不同类型的字体设置不同的显示策略
    for (const [_, instance] of this.fonts.entries()) {
      if (!instance.config.display) {
        // 关键字体使用swap
        if (instance.config.family.includes('sans-serif') || 
            instance.config.family.includes('serif')) {
          instance.config.display = 'swap'
        } else {
          // 装饰性字体使用optional
          instance.config.display = 'optional'
        }
      }
    }
  }

  private enableFontLoadingMonitoring(): void {
    // 监控字体加载性能
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource' && entry.name.includes('font')) {
          if (window.performanceMonitor) {
            window.performanceMonitor.reportMetric('font_resource_load', entry.duration, {
              url: entry.name,
              size: (entry as any).transferSize || 0
            })
          }
        }
      }
    })

    observer.observe({ entryTypes: ['resource'] })
  }

  private getUsedFonts(): Set<string> {
    const usedFonts = new Set<string>()
    
    // 检查DOM中使用的字体
    const elements = document.querySelectorAll('*')
    elements.forEach(element => {
      const computedStyle = window.getComputedStyle(element)
      const fontFamily = computedStyle.fontFamily
      
      // 解析字体族名称
      const families = fontFamily.split(',').map(f => f.trim().replace(/['"]/g, ''))
      families.forEach(family => {
        const key = this.getFontKey({ family })
        if (this.fonts.has(key)) {
          usedFonts.add(key)
        }
      })
    })

    return usedFonts
  }

  private applyFallbackFonts(originalFamily: string, fallbacks: string[]): void {
    // 更新CSS以使用回退字体
    const style = document.createElement('style')
    const fallbackList = [originalFamily, ...fallbacks].join(', ')
    
    style.textContent = `
      * {
        font-family: ${fallbackList} !important;
      }
    `
    
    document.head.appendChild(style)
  }

  // 清理资源
  destroy(): void {
    this.fonts.clear()
    this.loadingPromises.clear()
    this.preloadedFonts.clear()
    
    if (this.observer) {
      this.observer.disconnect()
    }
  }
}

// 全局字体加载器实例
export const fontLoader = new FontLoader()

// 预定义常用字体配置
export const commonFonts = {
  // 中文字体
  notoSansCJK: {
    family: 'Noto Sans CJK SC',
    src: [
      '/fonts/NotoSansCJKsc-Regular.woff2',
      '/fonts/NotoSansCJKsc-Regular.woff'
    ],
    display: 'swap' as const
  },
  
  sourceHanSans: {
    family: 'Source Han Sans SC',
    src: [
      '/fonts/SourceHanSansSC-Regular.woff2',
      '/fonts/SourceHanSansSC-Regular.woff'
    ],
    display: 'swap' as const
  },

  // 英文字体
  inter: {
    family: 'Inter',
    src: [
      '/fonts/Inter-Regular.woff2',
      '/fonts/Inter-Regular.woff'
    ],
    display: 'swap' as const
  },

  roboto: {
    family: 'Roboto',
    src: [
      '/fonts/Roboto-Regular.woff2',
      '/fonts/Roboto-Regular.woff'
    ],
    display: 'swap' as const
  }
}

// 便捷函数
export function loadFont(
  family: string,
  weight?: string | number,
  style?: string,
  options?: FontLoadOptions
): Promise<void> {
  return fontLoader.loadFont(family, weight, style, options)
}

export function preloadFont(family: string, options?: FontLoadOptions): void {
  const key = fontLoader['getFontKey']({ family })
  fontLoader.preloadFont(key, options)
}

export function registerCommonFonts(): void {
  Object.values(commonFonts).forEach(config => {
    fontLoader.registerFont(config, { preload: true })
  })
}

// 自动清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    fontLoader.destroy()
  })
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}