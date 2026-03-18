/**
 * Theme Transition - 主题切换优化
 * 提供平滑的暗色模式切换和主题过渡效果
 */

import { animationManager } from './animation'

// 主题类型
export type Theme = 'light' | 'dark' | 'auto'

// 主题配置
export interface ThemeConfig {
  name: string
  colors: Record<string, string>
  transitions?: {
    duration: number
    easing: string
    properties: string[]
  }
}

// 过渡选项
export interface TransitionOptions {
  duration?: number
  easing?: string
  enableAnimation?: boolean
  preserveScrollPosition?: boolean
  reduceMotion?: boolean
}

// 主题状态
export interface ThemeState {
  current: Theme
  previous?: Theme
  isTransitioning: boolean
  transitionStartTime?: number
  systemPreference: Theme
}

/**
 * 主题过渡管理器
 */
export class ThemeTransitionManager {
  private state: ThemeState
  private themes = new Map<string, ThemeConfig>()
  private mediaQuery?: MediaQueryList
  private observers: Array<(theme: Theme) => void> = []

  constructor() {
    this.state = {
      current: 'auto',
      isTransitioning: false,
      systemPreference: this.getSystemPreference()
    }

    this.initializeThemes()
    this.setupSystemPreferenceListener()
    this.setupReducedMotionListener()
  }

  // 注册主题
  registerTheme(config: ThemeConfig): void {
    this.themes.set(config.name, config)
  }

  // 切换主题
  async switchTheme(theme: Theme, options?: TransitionOptions): Promise<void> {
    if (this.state.isTransitioning) {
      console.warn('Theme transition already in progress')
      return
    }

    const config = {
      duration: 300,
      easing: 'ease-in-out',
      enableAnimation: true,
      preserveScrollPosition: true,
      reduceMotion: this.shouldReduceMotion(),
      ...options
    }

    this.state.previous = this.state.current
    this.state.current = theme
    this.state.isTransitioning = true
    this.state.transitionStartTime = performance.now()

    try {
      // 保存滚动位置
      const scrollPosition = config.preserveScrollPosition ? this.saveScrollPosition() : null

      // 执行主题切换动画
      if (config.enableAnimation && !config.reduceMotion) {
        await this.performAnimatedTransition(theme, config)
      } else {
        await this.performInstantTransition(theme)
      }

      // 恢复滚动位置
      if (scrollPosition && config.preserveScrollPosition) {
        this.restoreScrollPosition(scrollPosition)
      }

      // 通知观察者
      this.notifyObservers(theme)

      // 报告性能指标
      if (window.performanceMonitor && this.state.transitionStartTime) {
        const duration = performance.now() - this.state.transitionStartTime
        window.performanceMonitor.reportMetric('theme_transition_time', duration, {
          from: this.state.previous,
          to: theme,
          animated: config.enableAnimation && !config.reduceMotion
        })
      }

    } catch (error: any) {
      console.error('Theme transition failed:', error)
    } finally {
      this.state.isTransitioning = false
      this.state.transitionStartTime = undefined
    }
  }

  // 切换到下一个主题
  async toggleTheme(options?: TransitionOptions): Promise<void> {
    const themes: Theme[] = ['light', 'dark', 'auto']
    const currentIndex = themes.indexOf(this.state.current)
    const nextIndex = (currentIndex + 1) % themes.length
    const nextTheme = themes[nextIndex]

    await this.switchTheme(nextTheme, options)
  }

  // 获取当前主题
  getCurrentTheme(): Theme {
    return this.state.current
  }

  // 获取实际应用的主题（考虑auto模式）
  getEffectiveTheme(): 'light' | 'dark' {
    if (this.state.current === 'auto') {
      return this.state.systemPreference === 'dark' ? 'dark' : 'light'
    }
    return this.state.current as 'light' | 'dark'
  }

  // 获取主题状态
  getThemeState(): ThemeState {
    return { ...this.state }
  }

  // 添加主题变化观察者
  addObserver(callback: (theme: Theme) => void): void {
    this.observers.push(callback)
  }

  // 移除主题变化观察者
  removeObserver(callback: (theme: Theme) => void): void {
    const index = this.observers.indexOf(callback)
    if (index > -1) {
      this.observers.splice(index, 1)
    }
  }

  // 预加载主题资源
  async preloadTheme(theme: Theme): Promise<void> {
    const effectiveTheme = theme === 'auto' ? this.state.systemPreference : theme
    const themeConfig = this.themes.get(effectiveTheme)

    if (!themeConfig) return

    // 预加载主题相关的CSS和图片
    await this.preloadThemeAssets(effectiveTheme)
  }

  // 优化主题切换性能
  optimizeThemeTransitions(): void {
    // 预加载所有主题
    this.preloadAllThemes()

    // 设置CSS变量过渡
    this.setupCSSTransitions()

    // 启用硬件加速
    this.enableHardwareAcceleration()
  }

  private async performAnimatedTransition(theme: Theme, config: TransitionOptions): Promise<void> {
    const effectiveTheme = theme === 'auto' ? this.state.systemPreference : theme

    // 创建过渡遮罩
    const mask = this.createTransitionMask()
    document.body.appendChild(mask)

    try {
      // 第一阶段：遮罩进入
      await animationManager.fadeIn(mask, config.duration! / 2)

      // 应用新主题
      this.applyTheme(effectiveTheme as any)

      // 第二阶段：遮罩退出
      await animationManager.fadeOut(mask, config.duration! / 2)

    } finally {
      // 清理遮罩
      if (mask.parentNode) {
        mask.parentNode.removeChild(mask)
      }
    }
  }

  private async performInstantTransition(theme: Theme): Promise<void> {
    const effectiveTheme = theme === 'auto' ? this.state.systemPreference : theme
    this.applyTheme(effectiveTheme as any)
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    const themeConfig = this.themes.get(theme)
    if (!themeConfig) return

    // 更新CSS变量
    const root = document.documentElement
    Object.entries(themeConfig.colors).forEach(([property, value]) => {
      root.style.setProperty(`--${property}`, value)
    })

    // 更新body类名
    document.body.className = document.body.className.replace(/theme-\w+/g, '')
    document.body.classList.add(`theme-${theme}`)

    // 更新meta标签
    this.updateMetaThemeColor(theme)
  }

  private createTransitionMask(): HTMLElement {
    const mask = document.createElement('div')
    mask.className = 'theme-transition-mask'
    mask.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: var(--background-color, #ffffff);
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease-in-out;
    `
    return mask
  }

  private saveScrollPosition(): { x: number; y: number } {
    return {
      x: window.scrollX,
      y: window.scrollY
    }
  }

  private restoreScrollPosition(position: { x: number; y: number }): void {
    window.scrollTo(position.x, position.y)
  }

  private getSystemPreference(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light'

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  private shouldReduceMotion(): boolean {
    if (typeof window === 'undefined') return false

    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  private initializeThemes(): void {
    // 注册默认主题
    this.registerTheme({
      name: 'light',
      colors: {
        'background-color': '#ffffff',
        'text-color': '#333333',
        'primary-color': '#2196f3',
        'secondary-color': '#f5f5f5',
        'border-color': '#e0e0e0',
        'shadow-color': 'rgba(0, 0, 0, 0.1)'
      },
      transitions: {
        duration: 300,
        easing: 'ease-in-out',
        properties: ['background-color', 'color', 'border-color', 'box-shadow']
      }
    })

    this.registerTheme({
      name: 'dark',
      colors: {
        'background-color': '#1a1a1a',
        'text-color': '#e0e0e0',
        'primary-color': '#64b5f6',
        'secondary-color': '#2a2a2a',
        'border-color': '#404040',
        'shadow-color': 'rgba(0, 0, 0, 0.3)'
      },
      transitions: {
        duration: 300,
        easing: 'ease-in-out',
        properties: ['background-color', 'color', 'border-color', 'box-shadow']
      }
    })

    // 应用初始主题
    const initialTheme = this.getEffectiveTheme()
    this.applyTheme(initialTheme)
  }

  private setupSystemPreferenceListener(): void {
    if (typeof window === 'undefined') return

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      this.state.systemPreference = e.matches ? 'dark' : 'light'

      // 如果当前是auto模式，自动切换主题
      if (this.state.current === 'auto') {
        this.applyTheme(this.state.systemPreference)
        this.notifyObservers('auto')
      }
    }

    this.mediaQuery.addEventListener('change', handleChange)
  }

  private setupReducedMotionListener(): void {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const handleChange = () => {
      // 当用户偏好改变时，可以调整动画设置
      console.log('Reduced motion preference changed:', mediaQuery.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
  }

  private notifyObservers(theme: Theme): void {
    this.observers.forEach(callback => {
      try {
        callback(theme)
      } catch (error: any) {
        console.error('Theme observer error:', error)
      }
    })
  }

  private async preloadThemeAssets(theme: string): Promise<void> {
    // 预加载主题相关的图片和图标
    const themeAssets = [
      `/images/theme-${theme}-logo.svg`,
      `/images/theme-${theme}-background.jpg`
    ]

    const loadPromises = themeAssets.map(src => {
      return new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => resolve() // 忽略加载失败
        img.src = src
      })
    })

    await Promise.all(loadPromises)
  }

  private preloadAllThemes(): void {
    ['light', 'dark'].forEach(theme => {
      this.preloadThemeAssets(theme)
    })
  }

  private setupCSSTransitions(): void {
    const style = document.createElement('style')
    style.textContent = `
      :root {
        --theme-transition-duration: 0.3s;
        --theme-transition-easing: ease-in-out;
      }
      
      * {
        transition: 
          background-color var(--theme-transition-duration) var(--theme-transition-easing),
          color var(--theme-transition-duration) var(--theme-transition-easing),
          border-color var(--theme-transition-duration) var(--theme-transition-easing),
          box-shadow var(--theme-transition-duration) var(--theme-transition-easing);
      }
      
      /* 减少动画的用户偏好 */
      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
        }
      }
      
      /* 主题过渡遮罩 */
      .theme-transition-mask {
        will-change: opacity;
        transform: translateZ(0);
      }
    `
    document.head.appendChild(style)
  }

  private enableHardwareAcceleration(): void {
    const style = document.createElement('style')
    style.textContent = `
      body {
        will-change: background-color;
        transform: translateZ(0);
        backface-visibility: hidden;
      }
    `
    document.head.appendChild(style)
  }

  private updateMetaThemeColor(theme: 'light' | 'dark'): void {
    const themeConfig = this.themes.get(theme)
    if (!themeConfig) return

    let metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta')
      metaThemeColor.setAttribute('name', 'theme-color')
      document.head.appendChild(metaThemeColor)
    }

    const backgroundColor = themeConfig.colors['background-color']
    metaThemeColor.setAttribute('content', backgroundColor)
  }

  // 清理资源
  destroy(): void {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', () => { })
    }

    this.observers = []
    this.themes.clear()
  }
}

// 全局主题过渡管理器实例
export const themeTransitionManager = new ThemeTransitionManager()

// 便捷函数
export function switchTheme(theme: Theme, options?: TransitionOptions): Promise<void> {
  return themeTransitionManager.switchTheme(theme, options)
}

export function toggleTheme(options?: TransitionOptions): Promise<void> {
  return themeTransitionManager.toggleTheme(options)
}

export function getCurrentTheme(): Theme {
  return themeTransitionManager.getCurrentTheme()
}

export function getEffectiveTheme(): 'light' | 'dark' {
  return themeTransitionManager.getEffectiveTheme()
}

export function addThemeObserver(callback: (theme: Theme) => void): void {
  themeTransitionManager.addObserver(callback)
}

export function removeThemeObserver(callback: (theme: Theme) => void): void {
  themeTransitionManager.removeObserver(callback)
}

// Vue Composable
export function useTheme() {
  const currentTheme = ref(themeTransitionManager.getCurrentTheme())
  const effectiveTheme = ref(themeTransitionManager.getEffectiveTheme())
  const isTransitioning = ref(themeTransitionManager.getThemeState().isTransitioning)

  const observer = (theme: Theme) => {
    currentTheme.value = theme
    effectiveTheme.value = themeTransitionManager.getEffectiveTheme()
    isTransitioning.value = themeTransitionManager.getThemeState().isTransitioning
  }

  onMounted(() => {
    themeTransitionManager.addObserver(observer)
  })

  onUnmounted(() => {
    themeTransitionManager.removeObserver(observer)
  })

  return {
    currentTheme: readonly(currentTheme),
    effectiveTheme: readonly(effectiveTheme),
    isTransitioning: readonly(isTransitioning),
    switchTheme: (theme: Theme, options?: TransitionOptions) =>
      themeTransitionManager.switchTheme(theme, options),
    toggleTheme: (options?: TransitionOptions) =>
      themeTransitionManager.toggleTheme(options)
  }
}

// 自动清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    themeTransitionManager.destroy()
  })
}

// Vue 3 imports (需要在实际使用时导入)
declare const ref: any
declare const readonly: any
declare const onMounted: any
declare const onUnmounted: any

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}