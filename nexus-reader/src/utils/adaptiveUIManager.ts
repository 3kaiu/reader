/**
 * 自适应UI优化管理器 - Adaptive UI Optimization Manager
 * 基于用户、设备、环境等因素动态优化用户界面
 */

import { ref, reactive, readonly, computed, watch } from 'vue'
import { userAnalytics } from './userAnalytics'
import { logger } from './logger'

// ===== 数据结构 =====

export interface DeviceProfile {
  type: DeviceType
  screenSize: { width: number; height: number }
  pixelRatio: number
  touchSupport: boolean
  orientation: 'portrait' | 'landscape'
  connectionType: 'wifi' | 'mobile' | 'offline'
  batteryLevel: number
  memoryAvailable: number
}

export enum DeviceType {
  MOBILE = 'mobile',
  TABLET = 'tablet',
  DESKTOP = 'desktop',
  TV = 'tv'
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  fontSize: FontSize
  readingMode: ReadingMode
  layoutDensity: LayoutDensity
  animationLevel: AnimationLevel
  colorScheme: ColorScheme
  language: string
  notifications: NotificationSettings
}

export enum FontSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  EXTRA_LARGE = 'extra_large'
}

export enum ReadingMode {
  SCROLL = 'scroll',
  PAGINATION = 'pagination',
  AUTO = 'auto'
}

export enum LayoutDensity {
  COMPACT = 'compact',
  COMFORTABLE = 'comfortable',
  SPACIOUS = 'spacious'
}

export enum AnimationLevel {
  NONE = 'none',
  MINIMAL = 'minimal',
  FULL = 'full'
}

export interface ColorScheme {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  contrast: number
}

export interface NotificationSettings {
  readingReminders: boolean
  newContent: boolean
  recommendations: boolean
  systemUpdates: boolean
  soundEnabled: boolean
  vibrationEnabled: boolean
}

export interface AdaptiveUIConfig {
  enabled: boolean
  adaptationSpeed: 'slow' | 'medium' | 'fast'
  personalizationLevel: 'basic' | 'advanced' | 'full'
  accessibilityMode: boolean
  powerSavingMode: boolean
}

export interface UIAdaptationResult {
  layout: LayoutConfig
  typography: TypographyConfig
  interactions: InteractionConfig
  performance: PerformanceConfig
  accessibility: AccessibilityConfig
}

export interface LayoutConfig {
  containerWidth: string
  sidebarVisible: boolean
  sidebarWidth: string
  contentPadding: string
  gridColumns: number
  breakpoints: Record<string, number>
}

export interface TypographyConfig {
  fontFamily: string
  fontSize: string
  lineHeight: number
  letterSpacing: string
  textAlign: 'left' | 'justify'
  readingWidth: string
}

export interface InteractionConfig {
  touchTargets: 'small' | 'medium' | 'large'
  gestureSupport: boolean
  keyboardNavigation: boolean
  hoverEffects: boolean
  clickFeedback: boolean
}

export interface PerformanceConfig {
  imageQuality: 'low' | 'medium' | 'high'
  animationEnabled: boolean
  lazyLoading: boolean
  prefetchEnabled: boolean
  compressionLevel: number
}

export interface AccessibilityConfig {
  highContrast: boolean
  reducedMotion: boolean
  screenReaderSupport: boolean
  keyboardOnly: boolean
  focusIndicators: boolean
}

export interface UserBehaviorContext {
  readingSpeed: number
  sessionDuration: number
  clickPatterns: ClickPattern[]
  scrollBehavior: ScrollBehavior
  timeOfDay: number
  fatigueLevel: number
}

export interface ClickPattern {
  element: string
  frequency: number
  timeOfDay: number
}

export interface ScrollBehavior {
  speed: number
  direction: 'up' | 'down' | 'mixed'
  patterns: 'smooth' | 'jerky' | 'mixed'
}

// ===== 自适应UI管理器 =====

class AdaptiveUIManager {
  private deviceProfile = reactive<DeviceProfile>({
    type: DeviceType.DESKTOP,
    screenSize: { width: 1920, height: 1080 },
    pixelRatio: 1,
    touchSupport: false,
    orientation: 'landscape',
    connectionType: 'wifi',
    batteryLevel: 100,
    memoryAvailable: 8 * 1024 * 1024 * 1024 // 8GB
  })

  private userPreferences = reactive<UserPreferences>({
    theme: 'auto',
    fontSize: FontSize.MEDIUM,
    readingMode: ReadingMode.AUTO,
    layoutDensity: LayoutDensity.COMFORTABLE,
    animationLevel: AnimationLevel.FULL,
    colorScheme: {
      primary: '#1976d2',
      secondary: '#dc004e',
      accent: '#ff9800',
      background: '#ffffff',
      surface: '#f5f5f5',
      text: '#212121',
      contrast: 1.0
    },
    language: 'zh-CN',
    notifications: {
      readingReminders: true,
      newContent: true,
      recommendations: true,
      systemUpdates: false,
      soundEnabled: true,
      vibrationEnabled: false
    }
  })

  private config = reactive<AdaptiveUIConfig>({
    enabled: true,
    adaptationSpeed: 'medium',
    personalizationLevel: 'advanced',
    accessibilityMode: false,
    powerSavingMode: false
  })

  private currentAdaptation = reactive<UIAdaptationResult>({
    layout: {} as LayoutConfig,
    typography: {} as TypographyConfig,
    interactions: {} as InteractionConfig,
    performance: {} as PerformanceConfig,
    accessibility: {} as AccessibilityConfig
  })

  private behaviorContext = reactive<UserBehaviorContext>({
    readingSpeed: 200,
    sessionDuration: 0,
    clickPatterns: [],
    scrollBehavior: {
      speed: 0,
      direction: 'mixed',
      patterns: 'smooth'
    },
    timeOfDay: 12,
    fatigueLevel: 0
  })

  constructor() {
    this.initializeDeviceDetection()
    this.initializeUserPreferences()
    this.startAdaptationLoop()
  }

  // ===== 设备检测 =====

  private initializeDeviceDetection(): void {
    // 检测设备类型
    this.detectDeviceType()

    // 检测屏幕信息
    this.updateScreenInfo()

    // 检测连接类型
    this.detectConnectionType()

    // 检测电池状态
    this.detectBatteryStatus()

    // 监听变化
    this.setupDeviceListeners()
  }

  private detectDeviceType(): void {
    const ua = navigator.userAgent.toLowerCase()
    const width = window.innerWidth

    if (ua.includes('mobile') || width < 768) {
      this.deviceProfile.type = DeviceType.MOBILE
    } else if (ua.includes('tablet') || (width >= 768 && width < 1200)) {
      this.deviceProfile.type = DeviceType.TABLET
    } else if (width >= 1200) {
      this.deviceProfile.type = DeviceType.DESKTOP
    } else {
      this.deviceProfile.type = DeviceType.TV
    }

    this.deviceProfile.touchSupport = 'ontouchstart' in window
  }

  private updateScreenInfo(): void {
    this.deviceProfile.screenSize = {
      width: window.innerWidth,
      height: window.innerHeight
    }
    this.deviceProfile.pixelRatio = window.devicePixelRatio || 1
    this.deviceProfile.orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
  }

  private detectConnectionType(): void {
    const connection = (navigator as any).connection
    if (connection) {
      switch (connection.effectiveType) {
        case '4g':
        case '3g':
          this.deviceProfile.connectionType = 'mobile'
          break
        case '2g':
        case 'slow-2g':
          this.deviceProfile.connectionType = 'offline'
          break
        default:
          this.deviceProfile.connectionType = 'wifi'
      }
    }
  }

  private detectBatteryStatus(): void {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.deviceProfile.batteryLevel = Math.round(battery.level * 100)

        battery.addEventListener('levelchange', () => {
          this.deviceProfile.batteryLevel = Math.round(battery.level * 100)
          this.adaptToBatteryLevel()
        })
      })
    }
  }

  private setupDeviceListeners(): void {
    // 监听屏幕尺寸变化
    window.addEventListener('resize', () => {
      this.updateScreenInfo()
      this.adaptToScreenSize()
    })

    // 监听方向变化
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.updateScreenInfo(), 100)
    })

    // 监听连接变化
    if ((navigator as any).connection) {
      (navigator as any).connection.addEventListener('change', () => {
        this.detectConnectionType()
        this.adaptToConnectionType()
      })
    }
  }

  // ===== 用户偏好 =====

  private initializeUserPreferences(): void {
    // 从localStorage加载用户偏好
    const saved = localStorage.getItem('nexus_reader_preferences')
    if (saved) {
      try {
        const preferences = JSON.parse(saved)
        Object.assign(this.userPreferences, preferences)
      } catch (error) {
        logger.error('Failed to load user preferences:', error)
      }
    }

    // 从用户行为分析中学习偏好
    this.learnFromUserBehavior()
  }

  private learnFromUserBehavior(): void {
    // 从用户行为中学习偏好设置
    const userId = 'current_user' // 应该从认证系统中获取
    const userProfile = userAnalytics.getUserProfile(userId)

    if (userProfile) {
      // 基于阅读习惯调整字体大小
      const readingSpeed = userProfile.behavior.readingHabits.readingSpeed
      if (readingSpeed > 300) {
        this.userPreferences.fontSize = FontSize.LARGE
      } else if (readingSpeed < 150) {
        this.userPreferences.fontSize = FontSize.EXTRA_LARGE
      }

      // 基于会话时长调整布局密度
      const sessionDuration = userProfile.behavior.readingHabits.sessionDuration
      if (sessionDuration > 7200000) { // 2小时
        this.userPreferences.layoutDensity = LayoutDensity.SPACIOUS
      } else if (sessionDuration < 1800000) { // 30分钟
        this.userPreferences.layoutDensity = LayoutDensity.COMPACT
      }
    }
  }

  // ===== 自适应逻辑 =====

  private startAdaptationLoop(): void {
    // 初始适应
    this.performAdaptation()

    // 监听变化并重新适应
    watch(
      () => [this.deviceProfile, this.userPreferences, this.behaviorContext],
      () => {
        this.performAdaptation()
      },
      { deep: true }
    )

    // 定期重新评估（每5分钟）
    setInterval(() => {
      this.performAdaptation()
    }, 5 * 60 * 1000)
  }

  private performAdaptation(): void {
    if (!this.config.enabled) return

    const adaptation = this.calculateAdaptation()
    Object.assign(this.currentAdaptation, adaptation)

    // 应用CSS变量
    this.applyCSSVariables(adaptation)

    // 触发Vue组件重新渲染
    this.notifyComponents()

    logger.debug('UI adaptation applied', adaptation)
  }

  private calculateAdaptation(): UIAdaptationResult {
    return {
      layout: this.calculateLayoutConfig(),
      typography: this.calculateTypographyConfig(),
      interactions: this.calculateInteractionConfig(),
      performance: this.calculatePerformanceConfig(),
      accessibility: this.calculateAccessibilityConfig()
    }
  }

  private calculateLayoutConfig(): LayoutConfig {
    const { type, screenSize } = this.deviceProfile
    const { layoutDensity } = this.userPreferences

    let containerWidth = '1200px'
    let sidebarVisible = true
    let sidebarWidth = '280px'
    let contentPadding = '24px'
    let gridColumns = 12

    // 基于设备类型的布局调整
    switch (type) {
      case DeviceType.MOBILE:
        containerWidth = '100%'
        sidebarVisible = false
        contentPadding = '16px'
        gridColumns = 4
        break
      case DeviceType.TABLET:
        containerWidth = '100%'
        sidebarVisible = screenSize.width > 900
        sidebarWidth = '240px'
        contentPadding = '20px'
        gridColumns = 8
        break
      case DeviceType.DESKTOP:
        if (screenSize.width < 1200) {
          sidebarWidth = '240px'
        }
        break
    }

    // 基于布局密度的调整
    switch (layoutDensity) {
      case LayoutDensity.COMPACT:
        contentPadding = type === DeviceType.MOBILE ? '12px' : '16px'
        break
      case LayoutDensity.SPACIOUS:
        contentPadding = type === DeviceType.MOBILE ? '24px' : '32px'
        break
    }

    return {
      containerWidth,
      sidebarVisible,
      sidebarWidth,
      contentPadding,
      gridColumns,
      breakpoints: {
        mobile: 768,
        tablet: 1024,
        desktop: 1200
      }
    }
  }

  private calculateTypographyConfig(): TypographyConfig {
    const { type } = this.deviceProfile
    const { fontSize, readingMode } = this.userPreferences
    const { readingSpeed } = this.behaviorContext

    let baseFontSize = '16px'
    let lineHeight = 1.6
    let readingWidth = '65ch'

    // 基于字体大小偏好的调整
    switch (fontSize) {
      case FontSize.SMALL:
        baseFontSize = '14px'
        lineHeight = 1.5
        break
      case FontSize.LARGE:
        baseFontSize = '18px'
        lineHeight = 1.7
        break
      case FontSize.EXTRA_LARGE:
        baseFontSize = '20px'
        lineHeight = 1.8
        break
    }

    // 基于设备类型的调整
    if (type === DeviceType.MOBILE) {
      baseFontSize = this.adjustFontSizeForMobile(baseFontSize)
      readingWidth = '100%'
    }

    // 基于阅读速度的调整
    if (readingSpeed > 250) {
      // 快速阅读者喜欢更紧凑的排版
      lineHeight -= 0.1
    } else if (readingSpeed < 150) {
      // 慢速阅读者需要更大的行距
      lineHeight += 0.2
      readingWidth = '50ch'
    }

    // 基于阅读模式的调整
    if (readingMode === ReadingMode.PAGINATION) {
      readingWidth = '100%'
    }

    return {
      fontFamily: this.selectFontFamily(),
      fontSize: baseFontSize,
      lineHeight,
      letterSpacing: '0.01em',
      textAlign: readingMode === ReadingMode.SCROLL ? 'left' : 'justify',
      readingWidth
    }
  }

  private calculateInteractionConfig(): InteractionConfig {
    const { type, touchSupport, batteryLevel } = this.deviceProfile
    const { animationLevel } = this.userPreferences

    const touchTargets = touchSupport ? 'large' : 'medium'
    const gestureSupport = type === DeviceType.MOBILE || type === DeviceType.TABLET
    const keyboardNavigation = type === DeviceType.DESKTOP
    const hoverEffects = !touchSupport && animationLevel !== AnimationLevel.NONE
    const clickFeedback = touchSupport || batteryLevel > 20

    return {
      touchTargets: touchTargets as any,
      gestureSupport,
      keyboardNavigation,
      hoverEffects,
      clickFeedback
    }
  }

  private calculatePerformanceConfig(): PerformanceConfig {
    const { connectionType, batteryLevel, memoryAvailable } = this.deviceProfile
    const { animationLevel } = this.userPreferences

    let imageQuality: 'low' | 'medium' | 'high' = 'high'
    let animationEnabled = true
    let lazyLoading = true
    let prefetchEnabled = true
    let compressionLevel = 6

    // 基于连接类型的调整
    switch (connectionType) {
      case 'offline':
        imageQuality = 'low'
        animationEnabled = false
        prefetchEnabled = false
        compressionLevel = 9
        break
      case 'mobile':
        imageQuality = 'medium'
        lazyLoading = true
        compressionLevel = 7
        break
    }

    // 基于电池水平的调整
    if (batteryLevel < 20) {
      animationEnabled = false
      imageQuality = imageQuality === 'high' ? 'medium' : 'low'
      prefetchEnabled = false
    }

    // 基于内存的调整
    if (memoryAvailable < 2 * 1024 * 1024 * 1024) { // 2GB
      animationEnabled = false
      compressionLevel = Math.max(compressionLevel, 8)
    }

    // 基于动画偏好的调整
    if (animationLevel === AnimationLevel.NONE) {
      animationEnabled = false
    } else if (animationLevel === AnimationLevel.MINIMAL) {
      // 保持当前设置，但可能减少一些动画
    }

    return {
      imageQuality,
      animationEnabled,
      lazyLoading,
      prefetchEnabled,
      compressionLevel
    }
  }

  private calculateAccessibilityConfig(): AccessibilityConfig {
    const { type, batteryLevel } = this.deviceProfile
    const { accessibilityMode } = this.config

    const highContrast = accessibilityMode
    const reducedMotion = accessibilityMode || batteryLevel < 15
    const screenReaderSupport = true // 始终启用
    const keyboardOnly = accessibilityMode
    const focusIndicators = !reducedMotion

    return {
      highContrast,
      reducedMotion,
      screenReaderSupport,
      keyboardOnly,
      focusIndicators
    }
  }

  // ===== 辅助方法 =====

  private adjustFontSizeForMobile(baseSize: string): string {
    const size = parseInt(baseSize)
    // 在移动设备上稍微调小字体
    return `${Math.max(size - 1, 14)}px`
  }

  private selectFontFamily(): string {
    // 基于用户偏好和设备选择最佳字体
    const { type } = this.deviceProfile

    if (type === DeviceType.MOBILE) {
      return 'system-ui, -apple-system, sans-serif'
    }

    return '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
  }

  private applyCSSVariables(adaptation: UIAdaptationResult): void {
    const root = document.documentElement

    // Layout variables
    Object.entries(adaptation.layout).forEach(([key, value]) => {
      root.style.setProperty(`--ui-${key}`, value)
    })

    // Typography variables
    Object.entries(adaptation.typography).forEach(([key, value]) => {
      root.style.setProperty(`--ui-typography-${key}`, value)
    })

    // Performance variables
    root.style.setProperty('--ui-performance-image-quality', adaptation.performance.imageQuality)
    root.style.setProperty('--ui-performance-animations', adaptation.performance.animationEnabled ? 'enabled' : 'disabled')
  }

  private notifyComponents(): void {
    // 发送自定义事件通知Vue组件
    window.dispatchEvent(new CustomEvent('ui-adaptation-changed', {
      detail: { ...this.currentAdaptation }
    }))
  }

  private adaptToScreenSize(): void {
    // 屏幕尺寸变化时的特殊处理
    this.performAdaptation()
  }

  private adaptToBatteryLevel(): void {
    // 电池电量变化时的特殊处理
    if (this.deviceProfile.batteryLevel < 20) {
      this.config.powerSavingMode = true
    } else {
      this.config.powerSavingMode = false
    }
    this.performAdaptation()
  }

  private adaptToConnectionType(): void {
    // 网络连接变化时的特殊处理
    this.performAdaptation()
  }

  // ===== 公开接口 =====

  getDeviceProfile(): Readonly<DeviceProfile> {
    return readonly(this.deviceProfile)
  }

  getUserPreferences(): Readonly<UserPreferences> {
    return readonly(this.userPreferences)
  }

  getCurrentAdaptation(): Readonly<UIAdaptationResult> {
    return readonly(this.currentAdaptation)
  }

  updateUserPreferences(updates: Partial<UserPreferences>): void {
    Object.assign(this.userPreferences, updates)

    // 保存到localStorage
    localStorage.setItem('nexus_reader_preferences', JSON.stringify(this.userPreferences))

    // 重新适应
    this.performAdaptation()
  }

  updateBehaviorContext(context: Partial<UserBehaviorContext>): void {
    Object.assign(this.behaviorContext, context)
  }

  forceAdaptation(): void {
    this.performAdaptation()
  }

  // 预设配置
  applyPreset(preset: 'mobile' | 'desktop' | 'accessibility' | 'power-saving'): void {
    switch (preset) {
      case 'mobile':
        this.updateUserPreferences({
          layoutDensity: LayoutDensity.COMPACT,
          animationLevel: AnimationLevel.MINIMAL,
          fontSize: FontSize.MEDIUM
        })
        break
      case 'desktop':
        this.updateUserPreferences({
          layoutDensity: LayoutDensity.COMFORTABLE,
          animationLevel: AnimationLevel.FULL,
          fontSize: FontSize.MEDIUM
        })
        break
      case 'accessibility':
        this.config.accessibilityMode = true
        this.updateUserPreferences({
          fontSize: FontSize.EXTRA_LARGE,
          animationLevel: AnimationLevel.NONE,
          layoutDensity: LayoutDensity.SPACIOUS
        })
        break
      case 'power-saving':
        this.config.powerSavingMode = true
        this.updateUserPreferences({
          animationLevel: AnimationLevel.NONE,
          layoutDensity: LayoutDensity.COMPACT
        })
        break
    }
  }

  // 分析用户偏好
  analyzeUserPreferences(): Record<string, any> {
    const userId = 'current_user'
    const userProfile = userAnalytics.getUserProfile(userId)

    if (!userProfile) return {}

    return {
      preferredReadingTime: userProfile.behavior.readingHabits.readingSchedule.peakHours,
      contentTypePreferences: userProfile.behavior.readingHabits.preferredGenres,
      engagementLevel: userProfile.behavior.loyalty.engagementScore,
      accessibilityNeeds: this.config.accessibilityMode,
      performancePreferences: {
        animationTolerance: this.userPreferences.animationLevel,
        loadingSpeed: this.behaviorContext.readingSpeed > 200 ? 'fast' : 'normal'
      }
    }
  }
}

// ===== 响应式计算 =====

const adaptiveUIManager = new AdaptiveUIManager()

export const useAdaptiveUI = () => {
  const deviceProfile = computed(() => adaptiveUIManager.getDeviceProfile())
  const userPreferences = computed(() => adaptiveUIManager.getUserPreferences())
  const currentAdaptation = computed(() => adaptiveUIManager.getCurrentAdaptation())

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    adaptiveUIManager.updateUserPreferences(updates)
  }

  const applyPreset = (preset: 'mobile' | 'desktop' | 'accessibility' | 'power-saving') => {
    adaptiveUIManager.applyPreset(preset)
  }

  const forceAdaptation = () => {
    adaptiveUIManager.forceAdaptation()
  }

  return {
    deviceProfile: readonly(deviceProfile),
    userPreferences: readonly(userPreferences),
    currentAdaptation: readonly(currentAdaptation),
    updatePreferences,
    applyPreset,
    forceAdaptation
  }
}

// ===== Vue 插件 =====

export const adaptiveUIPlugin = {
  install(app: any) {
    app.config.globalProperties.$adaptiveUI = adaptiveUIManager
    app.provide('adaptiveUI', adaptiveUIManager)
  }
}

// ===== 便捷方法 =====

export const useDeviceProfile = () => computed(() => adaptiveUIManager.getDeviceProfile())
export const useUserPreferences = () => computed(() => adaptiveUIManager.getUserPreferences())
export const useUIAdaptation = () => computed(() => adaptiveUIManager.getCurrentAdaptation())

export default adaptiveUIManager