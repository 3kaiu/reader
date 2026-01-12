/**
 * Performance Integration - 性能系统集成
 * 统一管理所有性能优化组件
 */

import { performanceMonitor } from './performanceMonitor'
import { generalCache, swCacheManager } from './cacheManager'
import { globalMemoryManager } from './memoryManager'
import { networkDetector, requestOptimizer } from './networkOptimizer'
import { offlineManager } from './offlineManager'
import { buildTimeBudgetEnforcer, runtimeBudgetEnforcer } from './budgetEnforcement'
import { animationManager } from './animationManager'
import { smoothScrollManager } from './smoothScrolling'
import { fontLoader, registerCommonFonts } from './fontLoader'
import { themeTransitionManager } from './themeTransition'
import { performanceTestRunner } from './performanceTesting'

// 性能系统配置
export interface PerformanceSystemConfig {
  enableMonitoring?: boolean
  enableCaching?: boolean
  enableMemoryManagement?: boolean
  enableNetworkOptimization?: boolean
  enableOfflineSupport?: boolean
  enableBudgetEnforcement?: boolean
  enableAnimationOptimization?: boolean
  enableSmoothScrolling?: boolean
  enableFontOptimization?: boolean
  enableThemeTransitions?: boolean
  enableTesting?: boolean
  
  // 具体配置
  monitoringConfig?: {
    sampleRate?: number
    enableRealTimeReporting?: boolean
  }
  
  cacheConfig?: {
    maxSize?: number
    ttl?: number
  }
  
  memoryConfig?: {
    gcThreshold?: number
    monitoringInterval?: number
  }
  
  networkConfig?: {
    enableAdaptiveQuality?: boolean
    enableRequestBatching?: boolean
  }
  
  budgetConfig?: {
    enforceInProduction?: boolean
    alertThreshold?: number
  }
}

// 性能系统状态
export interface PerformanceSystemStatus {
  monitoring: {
    active: boolean
    metricsCollected: number
    lastUpdate: number
  }
  
  caching: {
    active: boolean
    hitRate: number
    size: number
  }
  
  memory: {
    active: boolean
    usage: number
    gcCount: number
  }
  
  network: {
    active: boolean
    requestCount: number
    averageResponseTime: number
  }
  
  offline: {
    active: boolean
    cachedItems: number
    isOnline: boolean
  }
  
  budget: {
    active: boolean
    violations: number
    lastCheck: number
  }
  
  animations: {
    active: boolean
    runningAnimations: number
    averageFps: number
  }
  
  fonts: {
    loaded: number
    failed: number
    totalSize: number
  }
  
  theme: {
    current: string
    transitionsEnabled: boolean
  }
}

/**
 * 性能系统管理器
 */
export class PerformanceSystemManager {
  private config: PerformanceSystemConfig
  private isInitialized = false
  private systems: Map<string, any> = new Map()
  private statusUpdateInterval?: number

  constructor(config: PerformanceSystemConfig = {}) {
    this.config = {
      enableMonitoring: true,
      enableCaching: true,
      enableMemoryManagement: true,
      enableNetworkOptimization: true,
      enableOfflineSupport: true,
      enableBudgetEnforcement: true,
      enableAnimationOptimization: true,
      enableSmoothScrolling: true,
      enableFontOptimization: true,
      enableThemeTransitions: true,
      enableTesting: false, // 默认关闭测试
      ...config
    }
  }

  // 初始化所有性能系统
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Performance system already initialized')
      return
    }

    console.log('🚀 Initializing performance optimization systems...')

    try {
      // 1. 初始化性能监控
      if (this.config.enableMonitoring) {
        await this.initializeMonitoring()
      }

      // 2. 初始化缓存系统
      if (this.config.enableCaching) {
        await this.initializeCaching()
      }

      // 3. 初始化内存管理
      if (this.config.enableMemoryManagement) {
        await this.initializeMemoryManagement()
      }

      // 4. 初始化网络优化
      if (this.config.enableNetworkOptimization) {
        await this.initializeNetworkOptimization()
      }

      // 5. 初始化离线支持
      if (this.config.enableOfflineSupport) {
        await this.initializeOfflineSupport()
      }

      // 6. 初始化性能预算
      if (this.config.enableBudgetEnforcement) {
        await this.initializeBudgetEnforcement()
      }

      // 7. 初始化动画优化
      if (this.config.enableAnimationOptimization) {
        await this.initializeAnimationOptimization()
      }

      // 8. 初始化平滑滚动
      if (this.config.enableSmoothScrolling) {
        await this.initializeSmoothScrolling()
      }

      // 9. 初始化字体优化
      if (this.config.enableFontOptimization) {
        await this.initializeFontOptimization()
      }

      // 10. 初始化主题过渡
      if (this.config.enableThemeTransitions) {
        await this.initializeThemeTransitions()
      }

      // 11. 初始化性能测试（仅在开发环境）
      if (this.config.enableTesting && import.meta.env.DEV) {
        await this.initializePerformanceTesting()
      }

      // 设置系统间的协调
      this.setupSystemCoordination()

      // 启动状态监控
      this.startStatusMonitoring()

      this.isInitialized = true
      console.log('✅ Performance optimization systems initialized successfully')

      // 报告初始化完成
      this.reportInitializationComplete()

    } catch (error) {
      console.error('❌ Failed to initialize performance systems:', error)
      throw error
    }
  }

  // 获取系统状态
  getSystemStatus(): PerformanceSystemStatus {
    return {
      monitoring: {
        active: this.systems.has('monitoring'),
        metricsCollected: this.systems.get('monitoring')?.getMetricsCount() || 0,
        lastUpdate: this.systems.get('monitoring')?.getLastUpdateTime() || 0
      },
      
      caching: {
        active: this.systems.has('caching'),
        hitRate: this.systems.get('caching')?.getHitRate() || 0,
        size: this.systems.get('caching')?.getSize() || 0
      },
      
      memory: {
        active: this.systems.has('memory'),
        usage: this.systems.get('memory')?.getCurrentUsage() || 0,
        gcCount: this.systems.get('memory')?.getGCCount() || 0
      },
      
      network: {
        active: this.systems.has('network'),
        requestCount: this.systems.get('network')?.getRequestCount() || 0,
        averageResponseTime: this.systems.get('network')?.getAverageResponseTime() || 0
      },
      
      offline: {
        active: this.systems.has('offline'),
        cachedItems: this.systems.get('offline')?.getCachedItemsCount() || 0,
        isOnline: navigator.onLine
      },
      
      budget: {
        active: this.systems.has('budget'),
        violations: this.systems.get('budget')?.getViolationCount() || 0,
        lastCheck: this.systems.get('budget')?.getLastCheckTime() || 0
      },
      
      animations: {
        active: this.systems.has('animations'),
        runningAnimations: this.systems.get('animations')?.getAnimationStats().active || 0,
        averageFps: this.systems.get('animations')?.getAnimationStats().averageFrameRate || 0
      },
      
      fonts: {
        loaded: Object.values(this.systems.get('fonts')?.getAllFontStates() || {}).filter(s => s === 'loaded').length,
        failed: Object.values(this.systems.get('fonts')?.getAllFontStates() || {}).filter(s => s === 'error').length,
        totalSize: 0 // 需要实现字体大小统计
      },
      
      theme: {
        current: this.systems.get('theme')?.getCurrentTheme() || 'light',
        transitionsEnabled: this.systems.has('theme')
      }
    }
  }

  // 优化性能
  async optimizePerformance(): Promise<void> {
    console.log('🔧 Running performance optimization...')

    const tasks = []

    // 清理缓存
    if (this.systems.has('caching')) {
      tasks.push(this.systems.get('caching').cleanup())
    }

    // 内存清理
    if (this.systems.has('memory')) {
      tasks.push(this.systems.get('memory').cleanup())
    }

    // 网络优化
    if (this.systems.has('network')) {
      tasks.push(this.systems.get('network').optimize())
    }

    // 动画优化
    if (this.systems.has('animations')) {
      this.systems.get('animations').optimizePerformance()
    }

    // 字体清理
    if (this.systems.has('fonts')) {
      this.systems.get('fonts').cleanupUnusedFonts()
    }

    await Promise.all(tasks)
    console.log('✅ Performance optimization completed')
  }

  // 生成性能报告
  generatePerformanceReport(): any {
    const status = this.getSystemStatus()
    const metrics = this.systems.get('monitoring')?.getCurrentMetrics() || {}
    
    return {
      timestamp: new Date().toISOString(),
      systemStatus: status,
      coreMetrics: metrics,
      recommendations: this.generateRecommendations(status, metrics),
      systemHealth: this.calculateSystemHealth(status)
    }
  }

  // 销毁所有系统
  async destroy(): Promise<void> {
    console.log('🛑 Shutting down performance systems...')

    // 停止状态监控
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval)
    }

    // 销毁各个系统
    const destroyTasks = Array.from(this.systems.values()).map(system => {
      if (typeof system.destroy === 'function') {
        return system.destroy()
      }
      return Promise.resolve()
    })

    await Promise.all(destroyTasks)
    
    this.systems.clear()
    this.isInitialized = false
    
    console.log('✅ Performance systems shut down')
  }

  private async initializeMonitoring(): Promise<void> {
    console.log('📊 Initializing performance monitoring...')
    
    const config = this.config.monitoringConfig || {}
    performanceMonitor.configure({
      sampleRate: config.sampleRate || 1,
      enableRealTimeReporting: config.enableRealTimeReporting !== false
    })
    
    performanceMonitor.startMonitoring()
    this.systems.set('monitoring', performanceMonitor)
  }

  private async initializeCaching(): Promise<void> {
    console.log('💾 Initializing cache management...')
    
    const config = this.config.cacheConfig || {}
    // 使用 generalCache 和 swCacheManager 替代 cacheManager
    // generalCache 已经是配置好的实例，无需额外配置
    await swCacheManager.initialize()
    this.systems.set('caching', { generalCache, swCacheManager })
  }

  private async initializeMemoryManagement(): Promise<void> {
    console.log('🧠 Initializing memory management...')
    
    const config = this.config.memoryConfig || {}
    globalMemoryManager.configure({
      gcThreshold: config.gcThreshold || 100 * 1024 * 1024, // 100MB
      monitoringInterval: config.monitoringInterval || 30000 // 30s
    })
    
    globalMemoryManager.startMonitoring()
    this.systems.set('memory', globalMemoryManager)
  }

  private async initializeNetworkOptimization(): Promise<void> {
    console.log('🌐 Initializing network optimization...')
    
    const config = this.config.networkConfig || {}
    // 使用 networkDetector 和 requestOptimizer 替代 networkOptimizer
    networkDetector.initialize()
    requestOptimizer.configure({
      enableAdaptiveQuality: config.enableAdaptiveQuality !== false,
      enableRequestBatching: config.enableRequestBatching !== false
    })
    
    this.systems.set('network', { networkDetector, requestOptimizer })
  }

  private async initializeOfflineSupport(): Promise<void> {
    console.log('📱 Initializing offline support...')
    
    await offlineManager.initialize()
    this.systems.set('offline', offlineManager)
  }

  private async initializeBudgetEnforcement(): Promise<void> {
    console.log('💰 Initializing performance budget enforcement...')
    
    const config = this.config.budgetConfig || {}
    // 使用 runtimeBudgetEnforcer 替代 budgetEnforcement
    runtimeBudgetEnforcer.configure({
      enforceInProduction: config.enforceInProduction !== false,
      alertThreshold: config.alertThreshold || 0.8
    })
    
    runtimeBudgetEnforcer.startMonitoring()
    this.systems.set('budget', { buildTimeBudgetEnforcer, runtimeBudgetEnforcer })
  }

  private async initializeAnimationOptimization(): Promise<void> {
    console.log('🎬 Initializing animation optimization...')
    
    // 动画管理器已经是全局实例，直接注册
    this.systems.set('animations', animationManager)
  }

  private async initializeSmoothScrolling(): Promise<void> {
    console.log('📜 Initializing smooth scrolling...')
    
    // 为所有滚动容器启用优化
    const scrollContainers = document.querySelectorAll('[data-scroll-container]')
    scrollContainers.forEach(container => {
      smoothScrollManager.optimizeScrolling(container as HTMLElement)
    })
    
    this.systems.set('scrolling', smoothScrollManager)
  }

  private async initializeFontOptimization(): Promise<void> {
    console.log('🔤 Initializing font optimization...')
    
    // 注册常用字体
    registerCommonFonts()
    
    // 优化字体加载
    fontLoader.optimizeFontLoading()
    
    this.systems.set('fonts', fontLoader)
  }

  private async initializeThemeTransitions(): Promise<void> {
    console.log('🎨 Initializing theme transitions...')
    
    // 优化主题切换
    themeTransitionManager.optimizeThemeTransitions()
    
    this.systems.set('theme', themeTransitionManager)
  }

  private async initializePerformanceTesting(): Promise<void> {
    console.log('🧪 Initializing performance testing...')
    
    // 仅在开发环境启用
    this.systems.set('testing', performanceTestRunner)
  }

  private setupSystemCoordination(): void {
    console.log('🔗 Setting up system coordination...')

    // 内存管理与缓存协调
    if (this.systems.has('memory') && this.systems.has('caching')) {
      this.systems.get('memory').onMemoryPressure(() => {
        this.systems.get('caching').cleanup()
      })
    }

    // 网络状态与离线管理协调
    if (this.systems.has('network') && this.systems.has('offline')) {
      window.addEventListener('online', () => {
        this.systems.get('offline').handleOnline()
      })
      
      window.addEventListener('offline', () => {
        this.systems.get('offline').handleOffline()
      })
    }

    // 性能预算与监控协调
    if (this.systems.has('budget') && this.systems.has('monitoring')) {
      this.systems.get('monitoring').onMetricsUpdate((metrics: any) => {
        this.systems.get('budget').checkBudgets(metrics)
      })
    }
  }

  private startStatusMonitoring(): void {
    this.statusUpdateInterval = window.setInterval(() => {
      const status = this.getSystemStatus()
      
      // 检查系统健康状况
      const health = this.calculateSystemHealth(status)
      if (health < 0.8) {
        console.warn('⚠️ Performance system health is degraded:', health)
        this.optimizePerformance()
      }
      
      // 报告状态更新
      if (this.systems.has('monitoring')) {
        this.systems.get('monitoring').reportSystemStatus(status)
      }
      
    }, 60000) // 每分钟检查一次
  }

  private calculateSystemHealth(status: PerformanceSystemStatus): number {
    let healthScore = 1.0
    
    // 检查各系统状态
    if (!status.monitoring.active) healthScore -= 0.1
    if (status.memory.usage > 150) healthScore -= 0.2
    if (status.caching.hitRate < 0.5) healthScore -= 0.1
    if (status.network.averageResponseTime > 1000) healthScore -= 0.2
    if (status.budget.violations > 5) healthScore -= 0.3
    if (status.animations.averageFps < 30) healthScore -= 0.1
    
    return Math.max(0, healthScore)
  }

  private generateRecommendations(status: PerformanceSystemStatus, metrics: any): string[] {
    const recommendations: string[] = []
    
    // 基于系统状态生成建议
    if (status.memory.usage > 100) {
      recommendations.push('内存使用过高，建议清理缓存或优化内存使用')
    }
    
    if (status.caching.hitRate < 0.6) {
      recommendations.push('缓存命中率较低，建议优化缓存策略')
    }
    
    if (status.network.averageResponseTime > 500) {
      recommendations.push('网络响应时间较慢，建议启用请求优化')
    }
    
    if (status.animations.averageFps < 45) {
      recommendations.push('动画帧率较低，建议减少并发动画或启用硬件加速')
    }
    
    if (status.budget.violations > 0) {
      recommendations.push('性能预算超标，建议检查资源使用情况')
    }
    
    // 基于核心指标生成建议
    if (metrics.lcp > 2500) {
      recommendations.push('LCP指标超标，建议优化关键资源加载')
    }
    
    if (metrics.cls > 0.1) {
      recommendations.push('CLS指标超标，建议优化布局稳定性')
    }
    
    return recommendations
  }

  private reportInitializationComplete(): void {
    const status = this.getSystemStatus()
    const enabledSystems = Object.entries(status)
      .filter(([_, systemStatus]) => (systemStatus as any).active)
      .map(([name]) => name)
    
    console.log(`✅ Performance systems active: ${enabledSystems.join(', ')}`)
    
    // 报告给监控系统
    if (this.systems.has('monitoring')) {
      this.systems.get('monitoring').reportEvent('performance_system_initialized', {
        enabledSystems,
        config: this.config
      })
    }
  }
}

// 全局性能系统管理器实例
export const performanceSystem = new PerformanceSystemManager()

// 自动初始化（在生产环境）
if (typeof window !== 'undefined' && !import.meta.env.DEV) {
  // 延迟初始化，避免阻塞页面加载
  setTimeout(() => {
    performanceSystem.initialize().catch(console.error)
  }, 1000)
}

// 页面卸载时清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    performanceSystem.destroy().catch(console.error)
  })
}

// 便捷函数
export function initializePerformanceSystem(config?: PerformanceSystemConfig): Promise<void> {
  return performanceSystem.initialize()
}

export function getPerformanceSystemStatus(): PerformanceSystemStatus {
  return performanceSystem.getSystemStatus()
}

export function optimizePerformance(): Promise<void> {
  return performanceSystem.optimizePerformance()
}

export function generatePerformanceReport(): any {
  return performanceSystem.generatePerformanceReport()
}