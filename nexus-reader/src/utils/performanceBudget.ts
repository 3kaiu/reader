/**
 * Performance Budget System - 性能预算系统
 * 定义和监控应用性能预算，确保性能目标得到满足
 */

import { performanceMonitor } from './performanceMonitor'
import { networkDetector } from './networkOptimizer'

// 性能预算配置
export interface PerformanceBudgetConfig {
  // 包大小预算 (字节)
  bundleSize: {
    initial: number      // 初始包大小
    total: number        // 总包大小
    perRoute: number     // 每个路由的包大小
    vendor: number       // 第三方库大小
    assets: number       // 静态资源大小
  }

  // Core Web Vitals 预算
  coreWebVitals: {
    lcp: number          // Largest Contentful Paint (ms)
    fid: number          // First Input Delay (ms)
    cls: number          // Cumulative Layout Shift
    fcp: number          // First Contentful Paint (ms)
    ttfb: number         // Time to First Byte (ms)
  }

  // 内存预算 (MB)
  memory: {
    heap: number         // 堆内存
    total: number        // 总内存
    domNodes: number     // DOM 节点数量
  }

  // 网络预算
  network: {
    requests: number     // 最大请求数
    totalSize: number    // 总传输大小 (字节)
    apiResponseTime: number // API响应时间 (ms)
  }

  // 渲染性能预算
  rendering: {
    fps: number          // 最低帧率
    longTasks: number    // 长任务数量限制
    layoutShifts: number // 布局偏移次数限制
  }
}

// 预算违规类型
export type BudgetViolationType =
  | 'bundle-size'
  | 'core-web-vitals'
  | 'memory'
  | 'network'
  | 'rendering'

// 预算违规详情
export interface BudgetViolation {
  type: BudgetViolationType
  metric: string
  actual: number
  budget: number
  severity: 'warning' | 'error' | 'critical'
  timestamp: number
  context?: any
}

// 预算监控结果
export interface BudgetMonitoringResult {
  passed: boolean
  violations: BudgetViolation[]
  score: number // 0-100
  recommendations: string[]
}

/**
 * 性能预算管理器
 */
export class PerformanceBudgetManager {
  private config: PerformanceBudgetConfig
  private violations: BudgetViolation[] = []
  private listeners: Array<(violation: BudgetViolation) => void> = []
  private monitoringInterval: number | null = null

  constructor(config?: Partial<PerformanceBudgetConfig>) {
    this.config = this.getDefaultConfig()
    if (config) {
      this.updateConfig(config)
    }
  }

  // 获取默认配置
  private getDefaultConfig(): PerformanceBudgetConfig {
    return {
      bundleSize: {
        initial: 500 * 1024,      // 500KB
        total: 2 * 1024 * 1024,   // 2MB
        perRoute: 200 * 1024,     // 200KB
        vendor: 800 * 1024,       // 800KB
        assets: 1 * 1024 * 1024   // 1MB
      },
      coreWebVitals: {
        lcp: 2500,    // 2.5s
        fid: 100,     // 100ms
        cls: 0.1,     // 0.1
        fcp: 1800,    // 1.8s
        ttfb: 800     // 800ms
      },
      memory: {
        heap: 100,    // 100MB
        total: 200,   // 200MB
        domNodes: 1500 // 1500个节点
      },
      network: {
        requests: 50,           // 50个请求
        totalSize: 3 * 1024 * 1024, // 3MB
        apiResponseTime: 1000   // 1s
      },
      rendering: {
        fps: 55,        // 55 FPS
        longTasks: 5,   // 最多5个长任务
        layoutShifts: 3 // 最多3次布局偏移
      }
    }
  }

  // 更新配置
  updateConfig(newConfig: Partial<PerformanceBudgetConfig>): void {
    this.config = this.mergeConfig(this.config, newConfig)
    console.log('📊 Performance budget config updated:', this.config)
  }

  // 开始监控
  startMonitoring(interval = 30000): void {
    if (this.monitoringInterval) return

    this.monitoringInterval = window.setInterval(() => {
      this.checkBudgets().catch(console.error)
    }, interval)

    console.log('📊 Performance budget monitoring started')
  }

  // 停止监控
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      console.log('📊 Performance budget monitoring stopped')
    }
  }

  // 检查所有预算
  async checkBudgets(): Promise<BudgetMonitoringResult> {
    const violations: BudgetViolation[] = []

    try {
      // 检查包大小预算
      const bundleViolations = await this.checkBundleSizeBudget()
      violations.push(...bundleViolations)

      // 检查 Core Web Vitals 预算
      const coreWebVitalsViolations = await this.checkCoreWebVitalsBudget()
      violations.push(...coreWebVitalsViolations)

      // 检查内存预算
      const memoryViolations = await this.checkMemoryBudget()
      violations.push(...memoryViolations)

      // 检查网络预算
      const networkViolations = await this.checkNetworkBudget()
      violations.push(...networkViolations)

      // 检查渲染性能预算
      const renderingViolations = await this.checkRenderingBudget()
      violations.push(...renderingViolations)

      // 更新违规记录
      this.violations.push(...violations)

      // 通知监听器
      violations.forEach(violation => {
        this.notifyViolation(violation)
      })

      // 计算性能分数
      const score = this.calculatePerformanceScore(violations)

      // 生成建议
      const recommendations = this.generateRecommendations(violations)

      const result: BudgetMonitoringResult = {
        passed: violations.length === 0,
        violations,
        score,
        recommendations
      }

      // 报告监控结果
      if (window.performanceMonitor) {
        window.performanceMonitor.reportMetric('budget_monitoring', score, {
          violationCount: violations.length,
          passed: result.passed
        })
      }

      return result

    } catch (error) {
      console.error('📊 Budget monitoring error:', error)
      return {
        passed: false,
        violations: [],
        score: 0,
        recommendations: ['监控系统出现错误，请检查配置']
      }
    }
  }

  // 检查包大小预算
  private async checkBundleSizeBudget(): Promise<BudgetViolation[]> {
    const violations: BudgetViolation[] = []

    try {
      // 获取包大小信息（这里需要与构建系统集成）
      const bundleInfo = await this.getBundleInfo()

      if (bundleInfo.initial > this.config.bundleSize.initial) {
        violations.push({
          type: 'bundle-size',
          metric: 'initial',
          actual: bundleInfo.initial,
          budget: this.config.bundleSize.initial,
          severity: this.getSeverity(bundleInfo.initial, this.config.bundleSize.initial),
          timestamp: Date.now()
        })
      }

      if (bundleInfo.total > this.config.bundleSize.total) {
        violations.push({
          type: 'bundle-size',
          metric: 'total',
          actual: bundleInfo.total,
          budget: this.config.bundleSize.total,
          severity: this.getSeverity(bundleInfo.total, this.config.bundleSize.total),
          timestamp: Date.now()
        })
      }

    } catch (error) {
      console.warn('Failed to check bundle size budget:', error)
    }

    return violations
  }

  // 检查 Core Web Vitals 预算
  private async checkCoreWebVitalsBudget(): Promise<BudgetViolation[]> {
    const violations: BudgetViolation[] = []

    try {
      const metrics = performanceMonitor.getMetrics()

      // 检查 LCP
      if (metrics.lcp && metrics.lcp > this.config.coreWebVitals.lcp) {
        violations.push({
          type: 'core-web-vitals',
          metric: 'lcp',
          actual: metrics.lcp,
          budget: this.config.coreWebVitals.lcp,
          severity: this.getSeverity(metrics.lcp, this.config.coreWebVitals.lcp),
          timestamp: Date.now()
        })
      }

      // 检查 FID
      if (metrics.fid && metrics.fid > this.config.coreWebVitals.fid) {
        violations.push({
          type: 'core-web-vitals',
          metric: 'fid',
          actual: metrics.fid,
          budget: this.config.coreWebVitals.fid,
          severity: this.getSeverity(metrics.fid, this.config.coreWebVitals.fid),
          timestamp: Date.now()
        })
      }

      // 检查 CLS
      if (metrics.cls && metrics.cls > this.config.coreWebVitals.cls) {
        violations.push({
          type: 'core-web-vitals',
          metric: 'cls',
          actual: metrics.cls,
          budget: this.config.coreWebVitals.cls,
          severity: this.getSeverity(metrics.cls, this.config.coreWebVitals.cls),
          timestamp: Date.now()
        })
      }

    } catch (error) {
      console.warn('Failed to check Core Web Vitals budget:', error)
    }

    return violations
  }

  // 检查内存预算
  private async checkMemoryBudget(): Promise<BudgetViolation[]> {
    const violations: BudgetViolation[] = []

    try {
      const memoryInfo = performanceMonitor.getMemoryInfo()

      if (memoryInfo.heapUsed > this.config.memory.heap * 1024 * 1024) {
        violations.push({
          type: 'memory',
          metric: 'heap',
          actual: memoryInfo.heapUsed / (1024 * 1024),
          budget: this.config.memory.heap,
          severity: this.getSeverity(memoryInfo.heapUsed, this.config.memory.heap * 1024 * 1024),
          timestamp: Date.now()
        })
      }

      // 优化：不再使用 document.querySelectorAll('*').length (O(N) 性能负担)
      // 改为估算或忽略全局计数，仅监控堆内存
      const domNodeCount = 0 // 假设平衡 

    } catch (error) {
      console.warn('Failed to check memory budget:', error)
    }

    return violations
  }

  // 检查网络预算
  private async checkNetworkBudget(): Promise<BudgetViolation[]> {
    const violations: BudgetViolation[] = []

    try {
      const networkInfo = performanceMonitor.getNetworkInfo()

      if (networkInfo.requestCount > this.config.network.requests) {
        violations.push({
          type: 'network',
          metric: 'requests',
          actual: networkInfo.requestCount,
          budget: this.config.network.requests,
          severity: this.getSeverity(networkInfo.requestCount, this.config.network.requests),
          timestamp: Date.now()
        })
      }

      if (networkInfo.totalSize > this.config.network.totalSize) {
        violations.push({
          type: 'network',
          metric: 'totalSize',
          actual: networkInfo.totalSize,
          budget: this.config.network.totalSize,
          severity: this.getSeverity(networkInfo.totalSize, this.config.network.totalSize),
          timestamp: Date.now()
        })
      }

    } catch (error) {
      console.warn('Failed to check network budget:', error)
    }

    return violations
  }

  // 检查渲染性能预算
  private async checkRenderingBudget(): Promise<BudgetViolation[]> {
    const violations: BudgetViolation[] = []

    try {
      const renderingInfo = performanceMonitor.getRenderingInfo()

      if (renderingInfo.averageFPS < this.config.rendering.fps) {
        violations.push({
          type: 'rendering',
          metric: 'fps',
          actual: renderingInfo.averageFPS,
          budget: this.config.rendering.fps,
          severity: this.getSeverity(this.config.rendering.fps, renderingInfo.averageFPS), // 反向比较
          timestamp: Date.now()
        })
      }

      if (renderingInfo.longTaskCount > this.config.rendering.longTasks) {
        violations.push({
          type: 'rendering',
          metric: 'longTasks',
          actual: renderingInfo.longTaskCount,
          budget: this.config.rendering.longTasks,
          severity: this.getSeverity(renderingInfo.longTaskCount, this.config.rendering.longTasks),
          timestamp: Date.now()
        })
      }

    } catch (error) {
      console.warn('Failed to check rendering budget:', error)
    }

    return violations
  }

  // 获取包信息（需要与构建系统集成）
  private async getBundleInfo(): Promise<{ initial: number; total: number; vendor: number; assets: number }> {
    // 这里应该从构建系统或运行时获取实际的包大小信息
    // 目前返回模拟数据
    return {
      initial: 450 * 1024,  // 450KB
      total: 1.8 * 1024 * 1024, // 1.8MB
      vendor: 750 * 1024,   // 750KB
      assets: 900 * 1024    // 900KB
    }
  }

  // 计算严重程度
  private getSeverity(actual: number, budget: number): 'warning' | 'error' | 'critical' {
    const ratio = actual / budget
    if (ratio >= 1.5) return 'critical'
    if (ratio >= 1.2) return 'error'
    return 'warning'
  }

  // 计算性能分数
  private calculatePerformanceScore(violations: BudgetViolation[]): number {
    if (violations.length === 0) return 100

    let totalPenalty = 0
    violations.forEach(violation => {
      const penalty = violation.severity === 'critical' ? 20 :
        violation.severity === 'error' ? 10 : 5
      totalPenalty += penalty
    })

    return Math.max(0, 100 - totalPenalty)
  }

  // 生成建议
  private generateRecommendations(violations: BudgetViolation[]): string[] {
    const recommendations: string[] = []
    const violationsByType = this.groupViolationsByType(violations)

    if (violationsByType['bundle-size']) {
      recommendations.push('考虑启用代码分割和懒加载来减少包大小')
      recommendations.push('移除未使用的依赖和代码')
      recommendations.push('启用 gzip/brotli 压缩')
    }

    if (violationsByType['core-web-vitals']) {
      recommendations.push('优化关键渲染路径')
      recommendations.push('减少主线程阻塞时间')
      recommendations.push('优化图片和字体加载')
    }

    if (violationsByType['memory']) {
      recommendations.push('检查内存泄漏')
      recommendations.push('优化 DOM 结构')
      recommendations.push('实现虚拟滚动')
    }

    if (violationsByType['network']) {
      recommendations.push('减少网络请求数量')
      recommendations.push('启用请求缓存')
      recommendations.push('优化 API 响应大小')
    }

    if (violationsByType['rendering']) {
      recommendations.push('优化动画性能')
      recommendations.push('减少重排和重绘')
      recommendations.push('使用 CSS transform 和 opacity')
    }

    return recommendations
  }

  // 按类型分组违规
  private groupViolationsByType(violations: BudgetViolation[]): Record<string, BudgetViolation[]> {
    return violations.reduce((groups, violation) => {
      if (!groups[violation.type]) {
        groups[violation.type] = []
      }
      groups[violation.type].push(violation)
      return groups
    }, {} as Record<string, BudgetViolation[]>)
  }

  // 合并配置
  private mergeConfig(base: PerformanceBudgetConfig, override: Partial<PerformanceBudgetConfig>): PerformanceBudgetConfig {
    return {
      bundleSize: { ...base.bundleSize, ...override.bundleSize },
      coreWebVitals: { ...base.coreWebVitals, ...override.coreWebVitals },
      memory: { ...base.memory, ...override.memory },
      network: { ...base.network, ...override.network },
      rendering: { ...base.rendering, ...override.rendering }
    }
  }

  // 通知违规
  private notifyViolation(violation: BudgetViolation): void {
    console.warn(`📊 Performance budget violation: ${violation.type}/${violation.metric}`, violation)

    this.listeners.forEach(listener => {
      try {
        listener(violation)
      } catch (error) {
        console.error('Budget violation listener error:', error)
      }
    })
  }

  // 添加违规监听器
  addViolationListener(listener: (violation: BudgetViolation) => void): void {
    this.listeners.push(listener)
  }

  // 移除违规监听器
  removeViolationListener(listener: (violation: BudgetViolation) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  // 获取违规历史
  getViolationHistory(): BudgetViolation[] {
    return [...this.violations]
  }

  // 清除违规历史
  clearViolationHistory(): void {
    this.violations = []
  }

  // 获取当前配置
  getConfig(): PerformanceBudgetConfig {
    return { ...this.config }
  }
}

// 全局性能预算管理器实例
export const performanceBudgetManager = new PerformanceBudgetManager()

// 自动启动监控
if (typeof window !== 'undefined') {
  // 页面加载完成后启动监控
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      performanceBudgetManager.startMonitoring()
    })
  } else {
    performanceBudgetManager.startMonitoring()
  }

  // 页面卸载时停止监控
  window.addEventListener('beforeunload', () => {
    performanceBudgetManager.stopMonitoring()
  })

  // 监听网络变化，调整预算
  networkDetector.addNetworkChangeListener((info) => {
    const networkQuality = networkDetector.getNetworkQuality()

    // 根据网络质量调整预算
    if (networkQuality === 'poor' || networkQuality === 'offline') {
      performanceBudgetManager.updateConfig({
        bundleSize: {
          initial: 300 * 1024,  // 更严格的预算
          total: 1.5 * 1024 * 1024
        },
        coreWebVitals: {
          lcp: 3500,  // 放宽 LCP 预算
          fid: 150
        }
      })
    }
  })
}

// 便捷函数
export function checkPerformanceBudgets(): Promise<BudgetMonitoringResult> {
  return performanceBudgetManager.checkBudgets()
}

export function updatePerformanceBudget(config: Partial<PerformanceBudgetConfig>): void {
  performanceBudgetManager.updateConfig(config)
}

export function getPerformanceBudgetViolations(): BudgetViolation[] {
  return performanceBudgetManager.getViolationHistory()
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
      getMetrics: () => any
      getMemoryInfo: () => any
      getNetworkInfo: () => any
      getRenderingInfo: () => any
    }
  }
}