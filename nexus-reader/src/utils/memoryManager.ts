/**
 * Memory Manager - 内存管理工具
 * 提供内存监控、垃圾回收提示和内存泄漏检测
 */

// 内存使用情况接口
export interface MemoryUsage {
  used: number      // 已使用内存 (MB)
  total: number     // 总内存 (MB)
  limit: number     // 内存限制 (MB)
  percentage: number // 使用百分比
}

// 内存监控配置
export interface MemoryConfig {
  warningThreshold: number    // 警告阈值 (MB)
  criticalThreshold: number   // 严重阈值 (MB)
  gcThreshold: number         // 垃圾回收阈值 (MB)
  checkInterval: number       // 检查间隔 (ms)
}

// 内存事件类型
export type MemoryEventType = 'warning' | 'critical' | 'gc-suggested' | 'leak-detected'

// 内存事件监听器
export type MemoryEventListener = (type: MemoryEventType, usage: MemoryUsage) => void

// 默认配置
const DEFAULT_CONFIG: MemoryConfig = {
  warningThreshold: 100,      // 100MB
  criticalThreshold: 150,     // 150MB
  gcThreshold: 120,           // 120MB
  checkInterval: 5000,        // 5秒
}

/**
 * 内存管理器
 */
export class MemoryManager {
  private config: MemoryConfig
  private listeners: MemoryEventListener[] = []
  private intervalId: number | null = null
  private lastUsage: MemoryUsage | null = null
  private usageHistory: MemoryUsage[] = []
  private maxHistorySize = 20

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // 开始监控
  startMonitoring(): void {
    if (this.intervalId) return

    this.intervalId = window.setInterval(() => {
      this.checkMemoryUsage()
    }, this.config.checkInterval)

    console.log('🧠 Memory monitoring started')
  }

  // 停止监控
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('🧠 Memory monitoring stopped')
    }
  }

  // 获取当前内存使用情况
  getCurrentUsage(): MemoryUsage | null {
    if (!this.isMemoryAPISupported()) {
      return null
    }

    const memory = (performance as any).memory
    const used = memory.usedJSHeapSize / 1024 / 1024
    const total = memory.totalJSHeapSize / 1024 / 1024
    const limit = memory.jsHeapSizeLimit / 1024 / 1024

    return {
      used,
      total,
      limit,
      percentage: (used / limit) * 100
    }
  }

  // 添加事件监听器
  addEventListener(listener: MemoryEventListener): void {
    this.listeners.push(listener)
  }

  // 移除事件监听器
  removeEventListener(listener: MemoryEventListener): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  // 手动触发垃圾回收（如果支持）
  suggestGarbageCollection(): void {
    if ('gc' in window && typeof (window as any).gc === 'function') {
      try {
        (window as any).gc()
        console.log('🗑️ Manual garbage collection triggered')
      } catch (error) {
        console.warn('Failed to trigger garbage collection:', error)
      }
    }
  }

  // 检测内存泄漏
  detectMemoryLeaks(): boolean {
    if (this.usageHistory.length < 10) return false

    // 检查最近10次的内存使用趋势
    const recent = this.usageHistory.slice(-10)
    const trend = this.calculateTrend(recent.map(u => u.used))

    // 如果内存使用持续增长且增长率超过阈值，可能存在内存泄漏
    const leakThreshold = 2 // MB per check
    return trend > leakThreshold
  }

  // 获取内存使用历史
  getUsageHistory(): MemoryUsage[] {
    return [...this.usageHistory]
  }

  // 获取内存统计信息
  getMemoryStats(): {
    current: MemoryUsage | null
    average: number
    peak: number
    trend: number
    leakDetected: boolean
  } {
    const current = this.getCurrentUsage()
    const history = this.usageHistory

    if (history.length === 0) {
      return {
        current,
        average: 0,
        peak: 0,
        trend: 0,
        leakDetected: false
      }
    }

    const usages = history.map(h => h.used)
    const average = usages.reduce((sum, usage) => sum + usage, 0) / usages.length
    const peak = Math.max(...usages)
    const trend = this.calculateTrend(usages)
    const leakDetected = this.detectMemoryLeaks()

    return {
      current,
      average,
      peak,
      trend,
      leakDetected
    }
  }

  // 清理内存（建议性操作）
  cleanup(): void {
    // 清理历史记录
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory = this.usageHistory.slice(-this.maxHistorySize)
    }

    // 建议垃圾回收
    this.suggestGarbageCollection()

    // 触发自定义清理事件
    this.emitEvent('gc-suggested', this.getCurrentUsage() || {
      used: 0, total: 0, limit: 0, percentage: 0
    })
  }

  private checkMemoryUsage(): void {
    const usage = this.getCurrentUsage()
    if (!usage) return

    // 记录历史
    this.usageHistory.push(usage)
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory.shift()
    }

    // 检查阈值
    if (usage.used > this.config.criticalThreshold) {
      this.emitEvent('critical', usage)
      this.cleanup()
    } else if (usage.used > this.config.warningThreshold) {
      this.emitEvent('warning', usage)
    }

    // 检查是否需要垃圾回收
    if (usage.used > this.config.gcThreshold) {
      this.emitEvent('gc-suggested', usage)
    }

    // 检查内存泄漏
    if (this.detectMemoryLeaks()) {
      this.emitEvent('leak-detected', usage)
    }

    this.lastUsage = usage
  }

  private emitEvent(type: MemoryEventType, usage: MemoryUsage): void {
    this.listeners.forEach(listener => {
      try {
        listener(type, usage)
      } catch (error) {
        console.error('Memory event listener error:', error)
      }
    })
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0

    // 简单线性回归计算趋势
    const n = values.length
    const sumX = (n * (n - 1)) / 2
    const sumY = values.reduce((sum, val) => sum + val, 0)
    const sumXY = values.reduce((sum, val, index) => sum + val * index, 0)
    const sumX2 = values.reduce((sum, _, index) => sum + index * index, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    return slope
  }

  private isMemoryAPISupported(): boolean {
    return 'memory' in performance && typeof (performance as any).memory === 'object'
  }
}

/**
 * 无限滚动内存管理器
 */
export class InfiniteScrollMemoryManager {
  private maxItems: number
  private items: any[] = []
  private memoryManager: MemoryManager

  constructor(maxItems = 20, memoryConfig?: Partial<MemoryConfig>) {
    this.maxItems = maxItems
    this.memoryManager = new MemoryManager(memoryConfig)

    // 监听内存事件
    this.memoryManager.addEventListener((type, usage) => {
      if (type === 'warning' || type === 'critical') {
        this.cleanup()
      }
    })
  }

  // 添加项目
  addItem(item: any): void {
    this.items.push(item)
    this.checkAndCleanup()
  }

  // 添加多个项目
  addItems(items: any[]): void {
    this.items.push(...items)
    this.checkAndCleanup()
  }

  // 获取所有项目
  getItems(): any[] {
    return this.items
  }

  // 获取项目数量
  getItemCount(): number {
    return this.items.length
  }

  // 清理旧项目
  cleanup(): void {
    if (this.items.length > this.maxItems) {
      const excess = this.items.length - this.maxItems
      this.items.splice(0, excess)
      console.log(`🧹 Cleaned up ${excess} items from infinite scroll`)
    }
  }

  // 强制清理
  forceCleanup(keepCount = Math.floor(this.maxItems / 2)): void {
    if (this.items.length > keepCount) {
      const removed = this.items.length - keepCount
      this.items.splice(0, removed)
      console.log(`🧹 Force cleaned up ${removed} items from infinite scroll`)
    }
  }

  // 开始内存监控
  startMonitoring(): void {
    this.memoryManager.startMonitoring()
  }

  // 停止内存监控
  stopMonitoring(): void {
    this.memoryManager.stopMonitoring()
  }

  private checkAndCleanup(): void {
    if (this.items.length > this.maxItems) {
      this.cleanup()
    }
  }
}

/**
 * 事件监听器内存管理器
 */
export class EventListenerManager {
  private listeners = new Map<string, {
    element: EventTarget
    type: string
    listener: EventListener
    options?: boolean | AddEventListenerOptions
  }>()

  // 添加事件监听器
  addEventListener(
    id: string,
    element: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    // 如果已存在，先移除
    this.removeEventListener(id)

    element.addEventListener(type, listener, options)
    this.listeners.set(id, { element, type, listener, options })
  }

  // 移除事件监听器
  removeEventListener(id: string): boolean {
    const listenerInfo = this.listeners.get(id)
    if (listenerInfo) {
      listenerInfo.element.removeEventListener(
        listenerInfo.type,
        listenerInfo.listener,
        listenerInfo.options
      )
      this.listeners.delete(id)
      return true
    }
    return false
  }

  // 移除所有事件监听器
  removeAllEventListeners(): void {
    for (const [id] of this.listeners) {
      this.removeEventListener(id)
    }
  }

  // 获取监听器数量
  getListenerCount(): number {
    return this.listeners.size
  }

  // 获取所有监听器ID
  getListenerIds(): string[] {
    return Array.from(this.listeners.keys())
  }
}

// 全局内存管理器实例
export const globalMemoryManager = new MemoryManager()

// 自动启动内存监控
if (typeof window !== 'undefined') {
  globalMemoryManager.startMonitoring()

  // 页面卸载时停止监控
  window.addEventListener('beforeunload', () => {
    globalMemoryManager.stopMonitoring()
  })

  // 监听内存事件并报告给性能监控系统
  globalMemoryManager.addEventListener((type, usage) => {
    console.log(`🧠 Memory event: ${type}`, usage)

    // 报告给性能监控系统
    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('memory_event', usage.used, {
        type,
        percentage: usage.percentage,
        threshold: type === 'critical' ? 'critical' : 'warning'
      })
    }
  })
}

// 工具函数
export function formatMemorySize(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return `${mb.toFixed(2)} MB`
}

export function isMemoryAPISupported(): boolean {
  return 'memory' in performance && typeof (performance as any).memory === 'object'
}

export function getCurrentMemoryUsage(): MemoryUsage | null {
  return globalMemoryManager.getCurrentUsage()
}

export function suggestGarbageCollection(): void {
  globalMemoryManager.suggestGarbageCollection()
}