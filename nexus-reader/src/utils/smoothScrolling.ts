/**
 * Smooth Scrolling - 平滑滚动优化
 * 提供60fps滚动性能和硬件加速
 */

// Performance monitoring integration

// 滚动配置
export interface SmoothScrollConfig {
  duration: number
  easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier'
  enableGPUAcceleration: boolean
  enableMomentumScrolling: boolean
  enableScrollSnap: boolean
  frameRateTarget: number
  customEasing?: string
}

// 滚动状态
export interface ScrollState {
  isScrolling: boolean
  startTime: number
  startPosition: { x: number; y: number }
  targetPosition: { x: number; y: number }
  currentPosition: { x: number; y: number }
  velocity: { x: number; y: number }
  frameRate: number
}

// 滚动事件
export interface ScrollEvent {
  type: 'start' | 'progress' | 'end' | 'cancel'
  position: { x: number; y: number }
  progress: number
  velocity: { x: number; y: number }
  timestamp: number
}

/**
 * 平滑滚动管理器
 */
export class SmoothScrollManager {
  private config: SmoothScrollConfig
  private scrollState: ScrollState
  private animationFrame: number | null = null
  private listeners: Array<(event: ScrollEvent) => void> = []
  private lastFrameTime = 0
  private frameCount = 0

  constructor(config?: Partial<SmoothScrollConfig>) {
    this.config = {
      duration: 800,
      easing: 'ease-out',
      enableGPUAcceleration: true,
      enableMomentumScrolling: true,
      enableScrollSnap: false,
      frameRateTarget: 60,
      ...config
    }

    this.scrollState = {
      isScrolling: false,
      startTime: 0,
      startPosition: { x: 0, y: 0 },
      targetPosition: { x: 0, y: 0 },
      currentPosition: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      frameRate: 60
    }

    this.initializeOptimizations()
  }

  // 平滑滚动到指定位置
  scrollTo(
    element: HTMLElement,
    x: number,
    y: number,
    options?: Partial<SmoothScrollConfig>
  ): Promise<void> {
    return new Promise((resolve) => {
      // 如果已在滚动，取消当前滚动
      if (this.scrollState.isScrolling) {
        this.cancelScroll()
      }

      const config = { ...this.config, ...options }
      const startTime = performance.now()
      const startX = element.scrollLeft
      const startY = element.scrollTop

      // 计算滚动距离
      const deltaX = x - startX
      const deltaY = y - startY

      // 如果距离很小，直接跳转
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        element.scrollTo(x, y)
        resolve()
        return
      }

      // 更新滚动状态
      this.scrollState = {
        isScrolling: true,
        startTime,
        startPosition: { x: startX, y: startY },
        targetPosition: { x, y },
        currentPosition: { x: startX, y: startY },
        velocity: { x: 0, y: 0 },
        frameRate: 60
      }

      // 启用GPU加速
      if (config.enableGPUAcceleration) {
        this.enableGPUAcceleration(element)
      }

      // 触发开始事件
      this.emitScrollEvent({
        type: 'start',
        position: this.scrollState.startPosition,
        progress: 0,
        velocity: { x: 0, y: 0 },
        timestamp: startTime
      })

      // 开始动画循环
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / config.duration, 1)

        // 计算缓动值
        const easedProgress = this.applyEasing(progress, config.easing, config.customEasing)

        // 计算当前位置
        const currentX = startX + deltaX * easedProgress
        const currentY = startY + deltaY * easedProgress

        // 计算速度
        const velocityX = (currentX - this.scrollState.currentPosition.x) / (currentTime - this.lastFrameTime || 16)
        const velocityY = (currentY - this.scrollState.currentPosition.y) / (currentTime - this.lastFrameTime || 16)

        // 更新状态
        this.scrollState.currentPosition = { x: currentX, y: currentY }
        this.scrollState.velocity = { x: velocityX, y: velocityY }

        // 执行滚动
        element.scrollTo(currentX, currentY)

        // 更新帧率
        this.updateFrameRate(currentTime)

        // 触发进度事件
        this.emitScrollEvent({
          type: 'progress',
          position: { x: currentX, y: currentY },
          progress,
          velocity: { x: velocityX, y: velocityY },
          timestamp: currentTime
        })

        // 检查是否完成
        if (progress >= 1) {
          this.completeScroll(element, resolve)
        } else {
          this.animationFrame = requestAnimationFrame(animate)
        }

        this.lastFrameTime = currentTime
      }

      this.animationFrame = requestAnimationFrame(animate)

      // 报告性能指标
      if (window.performanceMonitor) {
        window.performanceMonitor.reportMetric('smooth_scroll_start', 1, {
          distance: Math.sqrt(deltaX * deltaX + deltaY * deltaY),
          duration: config.duration,
          easing: config.easing
        })
      }
    })
  }

  // 平滑滚动到元素
  scrollToElement(
    container: HTMLElement,
    target: HTMLElement,
    options?: Partial<SmoothScrollConfig & {
      offset?: { x: number; y: number }
      align?: 'start' | 'center' | 'end'
    }>
  ): Promise<void> {
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    
    const offset = options?.offset || { x: 0, y: 0 }
    const align = options?.align || 'start'

    let targetX = container.scrollLeft
    let targetY = container.scrollTop

    // 计算水平位置
    switch (align) {
      case 'start':
        targetX = target.offsetLeft - offset.x
        break
      case 'center':
        targetX = target.offsetLeft - (containerRect.width - targetRect.width) / 2 - offset.x
        break
      case 'end':
        targetX = target.offsetLeft - containerRect.width + targetRect.width + offset.x
        break
    }

    // 计算垂直位置
    switch (align) {
      case 'start':
        targetY = target.offsetTop - offset.y
        break
      case 'center':
        targetY = target.offsetTop - (containerRect.height - targetRect.height) / 2 - offset.y
        break
      case 'end':
        targetY = target.offsetTop - containerRect.height + targetRect.height + offset.y
        break
    }

    return this.scrollTo(container, targetX, targetY, options)
  }

  // 取消当前滚动
  cancelScroll(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }

    if (this.scrollState.isScrolling) {
      this.scrollState.isScrolling = false
      
      this.emitScrollEvent({
        type: 'cancel',
        position: this.scrollState.currentPosition,
        progress: 0,
        velocity: { x: 0, y: 0 },
        timestamp: performance.now()
      })
    }
  }

  // 添加滚动事件监听器
  addEventListener(listener: (event: ScrollEvent) => void): void {
    this.listeners.push(listener)
  }

  // 移除滚动事件监听器
  removeEventListener(listener: (event: ScrollEvent) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  // 获取滚动状态
  getScrollState(): ScrollState {
    return { ...this.scrollState }
  }

  // 更新配置
  updateConfig(newConfig: Partial<SmoothScrollConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  // 优化滚动性能
  optimizeScrolling(element: HTMLElement): void {
    // 启用硬件加速
    if (this.config.enableGPUAcceleration) {
      this.enableGPUAcceleration(element)
    }

    // 启用动量滚动
    if (this.config.enableMomentumScrolling) {
      this.enableMomentumScrolling(element)
    }

    // 启用滚动捕捉
    if (this.config.enableScrollSnap) {
      this.enableScrollSnap(element)
    }

    // 优化滚动事件
    this.optimizeScrollEvents(element)
  }

  private initializeOptimizations(): void {
    // 全局滚动优化
    if (typeof window !== 'undefined') {
      // 禁用默认的平滑滚动行为
      document.documentElement.style.scrollBehavior = 'auto'
      
      // 优化触摸滚动
      document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true })
      document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true })
      document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true })
    }
  }

  private enableGPUAcceleration(element: HTMLElement): void {
    element.style.willChange = 'scroll-position'
    element.style.transform = element.style.transform || 'translateZ(0)'
    element.style.backfaceVisibility = 'hidden'
    element.style.perspective = '1000px'
  }

  private enableMomentumScrolling(element: HTMLElement): void {
    (element.style as any).webkitOverflowScrolling = 'touch';
    (element.style as any).overflowScrolling = 'touch'
  }

  private enableScrollSnap(element: HTMLElement): void {
    element.style.scrollSnapType = 'y mandatory'
    
    // 为子元素添加滚动捕捉点
    const children = element.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      child.style.scrollSnapAlign = 'start'
    }
  }

  private optimizeScrollEvents(element: HTMLElement): void {
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          // 处理滚动事件
          ticking = false
        })
        ticking = true
      }
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
  }

  private applyEasing(progress: number, easing: string, customEasing?: string): number {
    if (customEasing && easing === 'cubic-bezier') {
      // 解析自定义贝塞尔曲线
      const match = customEasing.match(/cubic-bezier\(([^)]+)\)/)
      if (match) {
        const values = match[1].split(',').map(v => parseFloat(v.trim()))
        if (values.length === 4) {
          return this.cubicBezier(values[0], values[1], values[2], values[3])(progress)
        }
      }
    }

    switch (easing) {
      case 'linear':
        return progress
      case 'ease':
        return this.cubicBezier(0.25, 0.1, 0.25, 1)(progress)
      case 'ease-in':
        return this.cubicBezier(0.42, 0, 1, 1)(progress)
      case 'ease-out':
        return this.cubicBezier(0, 0, 0.58, 1)(progress)
      case 'ease-in-out':
        return this.cubicBezier(0.42, 0, 0.58, 1)(progress)
      default:
        return progress
    }
  }

  private cubicBezier(x1: number, y1: number, x2: number, y2: number) {
    return (t: number) => {
      if (t <= 0) return 0
      if (t >= 1) return 1

      // 使用牛顿法求解
      let x = t
      for (let i = 0; i < 8; i++) {
        const fx = this.bezierX(x, x1, x2) - t
        if (Math.abs(fx) < 1e-7) break
        const dfx = this.bezierXDerivative(x, x1, x2)
        if (Math.abs(dfx) < 1e-7) break
        x = x - fx / dfx
      }

      return this.bezierY(x, y1, y2)
    }
  }

  private bezierX(t: number, x1: number, x2: number): number {
    return 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
  }

  private bezierY(t: number, y1: number, y2: number): number {
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
  }

  private bezierXDerivative(t: number, x1: number, x2: number): number {
    return 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2)
  }

  private updateFrameRate(currentTime: number): void {
    this.frameCount++
    if (currentTime - this.lastFrameTime >= 1000) {
      this.scrollState.frameRate = Math.round((this.frameCount * 1000) / (currentTime - this.lastFrameTime))
      this.frameCount = 0
    }
  }

  private completeScroll(element: HTMLElement, resolve: () => void): void {
    this.scrollState.isScrolling = false
    
    // 清理GPU加速
    if (this.config.enableGPUAcceleration) {
      element.style.willChange = 'auto'
    }

    // 触发完成事件
    this.emitScrollEvent({
      type: 'end',
      position: this.scrollState.targetPosition,
      progress: 1,
      velocity: { x: 0, y: 0 },
      timestamp: performance.now()
    })

    // 报告性能指标
    if (window.performanceMonitor) {
      const duration = performance.now() - this.scrollState.startTime
      window.performanceMonitor.reportMetric('smooth_scroll_complete', duration, {
        frameRate: this.scrollState.frameRate,
        targetFrameRate: this.config.frameRateTarget
      })
    }

    resolve()
  }

  private emitScrollEvent(event: ScrollEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Scroll event listener error:', error)
      }
    })
  }

  private handleTouchStart(_event: TouchEvent): void {
    // 处理触摸开始
  }

  private handleTouchMove(_event: TouchEvent): void {
    // 处理触摸移动
  }

  private handleTouchEnd(_event: TouchEvent): void {
    // 处理触摸结束
  }

  // 清理资源
  destroy(): void {
    this.cancelScroll()
    this.listeners = []
  }
}

// 全局平滑滚动管理器
export const smoothScrollManager = new SmoothScrollManager()

// 自动清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    smoothScrollManager.destroy()
  })
}

// 便捷函数
export function smoothScrollTo(
  element: HTMLElement,
  x: number,
  y: number,
  options?: Partial<SmoothScrollConfig>
): Promise<void> {
  return smoothScrollManager.scrollTo(element, x, y, options)
}

export function smoothScrollToElement(
  container: HTMLElement,
  target: HTMLElement,
  options?: any
): Promise<void> {
  return smoothScrollManager.scrollToElement(container, target, options)
}

export function optimizeScrolling(element: HTMLElement): void {
  smoothScrollManager.optimizeScrolling(element)
}

// Vue 指令支持
export const vSmoothScroll = {
  mounted(el: HTMLElement) {
    optimizeScrolling(el)
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