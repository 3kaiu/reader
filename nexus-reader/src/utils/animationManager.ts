/**
 * Animation Manager - 动画管理器
 * 提供高性能的动画和交互优化
 */

// Performance monitoring integration

// 动画类型
export type AnimationType = 'fade' | 'slide' | 'scale' | 'rotate' | 'bounce' | 'elastic' | 'custom'

// 缓动函数类型
export type EasingFunction = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier'

// 动画配置
export interface AnimationConfig {
  duration: number
  delay?: number
  easing?: EasingFunction | string
  fill?: 'none' | 'forwards' | 'backwards' | 'both'
  iterations?: number
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
  playbackRate?: number
}

// 动画状态
export type AnimationState = 'idle' | 'running' | 'paused' | 'finished' | 'cancelled'

// 动画实例
export interface AnimationInstance {
  id: string
  element: HTMLElement
  type: AnimationType
  config: AnimationConfig
  state: AnimationState
  animation?: Animation
  startTime: number
  endTime?: number
  onComplete?: () => void
  onCancel?: () => void
}

// 性能配置
export interface PerformanceConfig {
  enableGPUAcceleration: boolean
  maxConcurrentAnimations: number
  frameRateTarget: number
  enablePerformanceMonitoring: boolean
  enableAdaptiveQuality: boolean
}

// 触摸反馈配置
export interface TouchFeedbackConfig {
  enableHaptic: boolean
  enableVisualFeedback: boolean
  feedbackDuration: number
  feedbackIntensity: number
}

/**
 * 高性能动画管理器
 */
export class AnimationManager {
  private animations = new Map<string, AnimationInstance>()
  private performanceConfig: PerformanceConfig
  private touchConfig: TouchFeedbackConfig
  private frameRate = 60
  private lastFrameTime = 0
  private animationFrame: number | null = null

  constructor(
    performanceConfig?: Partial<PerformanceConfig>,
    touchConfig?: Partial<TouchFeedbackConfig>
  ) {
    this.performanceConfig = {
      enableGPUAcceleration: true,
      maxConcurrentAnimations: 10,
      frameRateTarget: 60,
      enablePerformanceMonitoring: true,
      enableAdaptiveQuality: true,
      ...performanceConfig
    }

    this.touchConfig = {
      enableHaptic: true,
      enableVisualFeedback: true,
      feedbackDuration: 150,
      feedbackIntensity: 0.5,
      ...touchConfig
    }

    this.initializePerformanceMonitoring()
    this.setupTouchFeedback()
  }

  // 创建动画
  animate(
    element: HTMLElement,
    type: AnimationType,
    config: AnimationConfig,
    customKeyframes?: Keyframe[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.generateAnimationId()
      
      // 检查并发动画限制
      if (this.animations.size >= this.performanceConfig.maxConcurrentAnimations) {
        this.cancelOldestAnimation()
      }

      // 启用GPU加速
      if (this.performanceConfig.enableGPUAcceleration) {
        this.enableGPUAcceleration(element)
      }

      // 创建动画实例
      const instance: AnimationInstance = {
        id,
        element,
        type,
        config,
        state: 'idle',
        startTime: performance.now(),
        onComplete: () => {
          this.completeAnimation(id)
          resolve()
        },
        onCancel: () => {
          this.cancelAnimation(id)
          reject(new Error('Animation cancelled'))
        }
      }

      // 获取关键帧
      const keyframes = customKeyframes || this.getKeyframes(type, element)
      
      // 创建Web Animation
      try {
        const animation = element.animate(keyframes, {
          duration: config.duration,
          delay: config.delay || 0,
          easing: config.easing || 'ease',
          fill: config.fill || 'forwards',
          iterations: config.iterations || 1,
          direction: config.direction || 'normal'
        })

        // 设置播放速率
        if (config.playbackRate) {
          animation.playbackRate = config.playbackRate
        }

        instance.animation = animation
        instance.state = 'running'

        // 监听动画事件
        animation.addEventListener('finish', () => {
          instance.onComplete?.()
        })

        animation.addEventListener('cancel', () => {
          instance.onCancel?.()
        })

        this.animations.set(id, instance)

        // 报告性能指标
        if (this.performanceConfig.enablePerformanceMonitoring) {
          this.reportAnimationStart(instance)
        }

      } catch (error) {
        reject(error)
      }
    })
  }

  // 淡入动画
  fadeIn(element: HTMLElement, duration = 300): Promise<void> {
    return this.animate(element, 'fade', { duration }, [
      { opacity: 0 },
      { opacity: 1 }
    ])
  }

  // 淡出动画
  fadeOut(element: HTMLElement, duration = 300): Promise<void> {
    return this.animate(element, 'fade', { duration }, [
      { opacity: 1 },
      { opacity: 0 }
    ])
  }

  // 滑入动画
  slideIn(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down' = 'left', duration = 300): Promise<void> {
    const transforms = {
      left: ['translateX(-100%)', 'translateX(0)'],
      right: ['translateX(100%)', 'translateX(0)'],
      up: ['translateY(-100%)', 'translateY(0)'],
      down: ['translateY(100%)', 'translateY(0)']
    }

    return this.animate(element, 'slide', { duration }, [
      { transform: transforms[direction][0], opacity: 0 },
      { transform: transforms[direction][1], opacity: 1 }
    ])
  }

  // 滑出动画
  slideOut(element: HTMLElement, direction: 'left' | 'right' | 'up' | 'down' = 'left', duration = 300): Promise<void> {
    const transforms = {
      left: ['translateX(0)', 'translateX(-100%)'],
      right: ['translateX(0)', 'translateX(100%)'],
      up: ['translateY(0)', 'translateY(-100%)'],
      down: ['translateY(0)', 'translateY(100%)']
    }

    return this.animate(element, 'slide', { duration }, [
      { transform: transforms[direction][0], opacity: 1 },
      { transform: transforms[direction][1], opacity: 0 }
    ])
  }

  // 缩放动画
  scale(element: HTMLElement, from = 0, to = 1, duration = 300): Promise<void> {
    return this.animate(element, 'scale', { duration }, [
      { transform: `scale(${from})`, opacity: from === 0 ? 0 : 1 },
      { transform: `scale(${to})`, opacity: to === 0 ? 0 : 1 }
    ])
  }

  // 弹跳动画
  bounce(element: HTMLElement, intensity = 1, duration = 600): Promise<void> {
    return this.animate(element, 'bounce', { 
      duration, 
      easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' 
    }, [
      { transform: 'scale(1)' },
      { transform: `scale(${1 + intensity * 0.1})` },
      { transform: 'scale(1)' }
    ])
  }

  // 摇摆动画
  shake(element: HTMLElement, intensity = 10, duration = 500): Promise<void> {
    return this.animate(element, 'custom', { duration }, [
      { transform: 'translateX(0)' },
      { transform: `translateX(-${intensity}px)` },
      { transform: `translateX(${intensity}px)` },
      { transform: `translateX(-${intensity * 0.5}px)` },
      { transform: `translateX(${intensity * 0.5}px)` },
      { transform: 'translateX(0)' }
    ])
  }

  // 脉冲动画
  pulse(element: HTMLElement, scale = 1.05, duration = 1000): Promise<void> {
    return this.animate(element, 'custom', { 
      duration, 
      iterations: 'infinite',
      direction: 'alternate'
    }, [
      { transform: 'scale(1)' },
      { transform: `scale(${scale})` }
    ])
  }

  // 旋转动画
  rotate(element: HTMLElement, degrees = 360, duration = 1000): Promise<void> {
    return this.animate(element, 'rotate', { duration }, [
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${degrees}deg)` }
    ])
  }

  // 暂停动画
  pauseAnimation(id: string): void {
    const instance = this.animations.get(id)
    if (instance && instance.animation) {
      instance.animation.pause()
      instance.state = 'paused'
    }
  }

  // 恢复动画
  resumeAnimation(id: string): void {
    const instance = this.animations.get(id)
    if (instance && instance.animation) {
      instance.animation.play()
      instance.state = 'running'
    }
  }

  // 取消动画
  cancelAnimation(id: string): void {
    const instance = this.animations.get(id)
    if (instance) {
      if (instance.animation) {
        instance.animation.cancel()
      }
      instance.state = 'cancelled'
      this.animations.delete(id)
    }
  }

  // 取消所有动画
  cancelAllAnimations(): void {
    for (const id of this.animations.keys()) {
      this.cancelAnimation(id)
    }
  }

  // 触摸反馈
  addTouchFeedback(element: HTMLElement, options?: {
    type?: 'scale' | 'opacity' | 'both'
    intensity?: number
    duration?: number
  }): void {
    const config = {
      type: 'both' as const,
      intensity: 0.95,
      duration: this.touchConfig.feedbackDuration,
      ...options
    }

    let isPressed = false

    const handleTouchStart = async (_event: TouchEvent | MouseEvent) => {
      if (isPressed) return
      isPressed = true

      // 触觉反馈
      if (this.touchConfig.enableHaptic && 'vibrate' in navigator) {
        navigator.vibrate(50)
      }

      // 视觉反馈
      if (this.touchConfig.enableVisualFeedback) {
        const keyframes: Keyframe[] = []
        
        if (config.type === 'scale' || config.type === 'both') {
          keyframes.push(
            { transform: 'scale(1)', opacity: 1 },
            { transform: `scale(${config.intensity})`, opacity: config.type === 'both' ? 0.8 : 1 }
          )
        } else if (config.type === 'opacity') {
          keyframes.push(
            { opacity: 1 },
            { opacity: 0.8 }
          )
        }

        try {
          await this.animate(element, 'custom', { 
            duration: config.duration,
            fill: 'forwards'
          }, keyframes)
        } catch (error) {
          // 动画可能被取消，忽略错误
        }
      }
    }

    const handleTouchEnd = async () => {
      if (!isPressed) return
      isPressed = false

      // 恢复原状
      if (this.touchConfig.enableVisualFeedback) {
        const keyframes: Keyframe[] = []
        
        if (config.type === 'scale' || config.type === 'both') {
          keyframes.push(
            { transform: `scale(${config.intensity})`, opacity: config.type === 'both' ? 0.8 : 1 },
            { transform: 'scale(1)', opacity: 1 }
          )
        } else if (config.type === 'opacity') {
          keyframes.push(
            { opacity: 0.8 },
            { opacity: 1 }
          )
        }

        try {
          await this.animate(element, 'custom', { 
            duration: config.duration,
            fill: 'forwards'
          }, keyframes)
        } catch (error) {
          // 动画可能被取消，忽略错误
        }
      }
    }

    // 添加事件监听器
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
    element.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    element.addEventListener('mousedown', handleTouchStart)
    element.addEventListener('mouseup', handleTouchEnd)
    element.addEventListener('mouseleave', handleTouchEnd)

    // 存储清理函数
    const cleanup = () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
      element.removeEventListener('touchcancel', handleTouchEnd)
      element.removeEventListener('mousedown', handleTouchStart)
      element.removeEventListener('mouseup', handleTouchEnd)
      element.removeEventListener('mouseleave', handleTouchEnd)
    }

    // 将清理函数存储在元素上
    ;(element as any)._touchFeedbackCleanup = cleanup
  }

  // 移除触摸反馈
  removeTouchFeedback(element: HTMLElement): void {
    const cleanup = (element as any)._touchFeedbackCleanup
    if (cleanup) {
      cleanup()
      delete (element as any)._touchFeedbackCleanup
    }
  }

  // 获取动画统计
  getAnimationStats(): {
    active: number
    total: number
    averageFrameRate: number
    performanceScore: number
  } {
    const active = Array.from(this.animations.values()).filter(a => a.state === 'running').length
    
    return {
      active,
      total: this.animations.size,
      averageFrameRate: this.frameRate,
      performanceScore: this.calculatePerformanceScore()
    }
  }

  // 优化性能
  optimizePerformance(): void {
    // 取消低优先级动画
    if (this.animations.size > this.performanceConfig.maxConcurrentAnimations) {
      const sortedAnimations = Array.from(this.animations.values())
        .sort((a, b) => a.startTime - b.startTime)
      
      const toCancel = sortedAnimations.slice(0, sortedAnimations.length - this.performanceConfig.maxConcurrentAnimations)
      toCancel.forEach(animation => this.cancelAnimation(animation.id))
    }

    // 降低动画质量
    if (this.performanceConfig.enableAdaptiveQuality && this.frameRate < 30) {
      this.reduceAnimationQuality()
    }
  }

  private initializePerformanceMonitoring(): void {
    if (!this.performanceConfig.enablePerformanceMonitoring) return

    const measureFrameRate = () => {
      const now = performance.now()
      if (this.lastFrameTime > 0) {
        const delta = now - this.lastFrameTime
        this.frameRate = Math.round(1000 / delta)
      }
      this.lastFrameTime = now

      this.animationFrame = requestAnimationFrame(measureFrameRate)
    }

    measureFrameRate()
  }

  private setupTouchFeedback(): void {
    // 为所有可交互元素自动添加触摸反馈
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement
            
            // 检查是否是可交互元素
            if (this.isInteractiveElement(element)) {
              this.addTouchFeedback(element)
            }
            
            // 检查子元素
            const interactiveChildren = element.querySelectorAll('button, a, [role="button"], [tabindex]')
            interactiveChildren.forEach((child) => {
              this.addTouchFeedback(child as HTMLElement)
            })
          }
        })
      })
    })

    observer.observe(document.body, { childList: true, subtree: true })
  }

  private isInteractiveElement(element: HTMLElement): boolean {
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea']
    const interactiveRoles = ['button', 'link', 'tab', 'menuitem']
    
    return (
      interactiveTags.includes(element.tagName.toLowerCase()) ||
      interactiveRoles.includes(element.getAttribute('role') || '') ||
      element.hasAttribute('tabindex') ||
      element.hasAttribute('onclick')
    )
  }

  private enableGPUAcceleration(element: HTMLElement): void {
    element.style.willChange = 'transform, opacity'
    element.style.transform = element.style.transform || 'translateZ(0)'
  }

  private getKeyframes(type: AnimationType, _element: HTMLElement): Keyframe[] {
    switch (type) {
      case 'fade':
        return [{ opacity: 0 }, { opacity: 1 }]
      case 'slide':
        return [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }]
      case 'scale':
        return [{ transform: 'scale(0)' }, { transform: 'scale(1)' }]
      case 'rotate':
        return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }]
      case 'bounce':
        return [
          { transform: 'scale(1)' },
          { transform: 'scale(1.1)' },
          { transform: 'scale(1)' }
        ]
      default:
        return [{ opacity: 0 }, { opacity: 1 }]
    }
  }

  private generateAnimationId(): string {
    return `anim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  private cancelOldestAnimation(): void {
    let oldest: AnimationInstance | null = null
    let oldestTime = Infinity

    for (const animation of this.animations.values()) {
      if (animation.startTime < oldestTime) {
        oldest = animation
        oldestTime = animation.startTime
      }
    }

    if (oldest) {
      this.cancelAnimation(oldest.id)
    }
  }

  private completeAnimation(id: string): void {
    const instance = this.animations.get(id)
    if (instance) {
      instance.state = 'finished'
      instance.endTime = performance.now()
      
      // 报告性能指标
      if (this.performanceConfig.enablePerformanceMonitoring) {
        this.reportAnimationComplete(instance)
      }
      
      // 清理GPU加速
      if (this.performanceConfig.enableGPUAcceleration) {
        instance.element.style.willChange = 'auto'
      }
      
      this.animations.delete(id)
    }
  }

  private reportAnimationStart(instance: AnimationInstance): void {
    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('animation_start', 1, {
        type: instance.type,
        duration: instance.config.duration,
        concurrent: this.animations.size
      })
    }
  }

  private reportAnimationComplete(instance: AnimationInstance): void {
    if (window.performanceMonitor && instance.endTime) {
      const actualDuration = instance.endTime - instance.startTime
      window.performanceMonitor.reportMetric('animation_complete', actualDuration, {
        type: instance.type,
        expectedDuration: instance.config.duration,
        frameRate: this.frameRate
      })
    }
  }

  private calculatePerformanceScore(): number {
    const frameRateScore = Math.min(100, (this.frameRate / this.performanceConfig.frameRateTarget) * 100)
    const concurrencyScore = Math.max(0, 100 - (this.animations.size / this.performanceConfig.maxConcurrentAnimations) * 50)
    
    return Math.round((frameRateScore + concurrencyScore) / 2)
  }

  private reduceAnimationQuality(): void {
    // 减少动画持续时间
    for (const instance of this.animations.values()) {
      if (instance.animation && instance.state === 'running') {
        instance.animation.playbackRate = 1.5
      }
    }
  }

  // 清理资源
  destroy(): void {
    this.cancelAllAnimations()
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
    }
  }
}

// 全局动画管理器实例
export const animationManager = new AnimationManager()

// 自动清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    animationManager.destroy()
  })
}

// 便捷函数
export function fadeIn(element: HTMLElement, duration?: number): Promise<void> {
  return animationManager.fadeIn(element, duration)
}

export function fadeOut(element: HTMLElement, duration?: number): Promise<void> {
  return animationManager.fadeOut(element, duration)
}

export function slideIn(element: HTMLElement, direction?: 'left' | 'right' | 'up' | 'down', duration?: number): Promise<void> {
  return animationManager.slideIn(element, direction, duration)
}

export function slideOut(element: HTMLElement, direction?: 'left' | 'right' | 'up' | 'down', duration?: number): Promise<void> {
  return animationManager.slideOut(element, direction, duration)
}

export function scale(element: HTMLElement, from?: number, to?: number, duration?: number): Promise<void> {
  return animationManager.scale(element, from, to, duration)
}

export function bounce(element: HTMLElement, intensity?: number, duration?: number): Promise<void> {
  return animationManager.bounce(element, intensity, duration)
}

export function shake(element: HTMLElement, intensity?: number, duration?: number): Promise<void> {
  return animationManager.shake(element, intensity, duration)
}

export function addTouchFeedback(element: HTMLElement, options?: any): void {
  animationManager.addTouchFeedback(element, options)
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}