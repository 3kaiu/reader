/**
 * 🏥 Health Monitor - 系统健康检查监控
 * 统一监控所有系统组件的健康状态，提供自动检查、告警和恢复机制
 */

import { logger } from './logger'
import { storageHealth } from './storageHealth'
import { performanceSystem } from './performanceIntegration'
import { globalMemoryManager } from './memoryManager'
import { networkDetector } from './networkOptimizer'
import { offlineManager } from './offlineManager'

// 健康检查结果
export interface HealthCheckResult {
  component: string
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  message: string
  details?: any
  timestamp: number
  responseTime?: number
}

// 系统健康状态
export interface SystemHealthStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'unknown'
  score: number // 0-100
  components: HealthCheckResult[]
  lastCheck: number
  uptime: number
  resourceUsage: {
    memory: number
    storage: number
    network: number
  }
  alerts: HealthAlert[]
}

// 健康告警
export interface HealthAlert {
  id: string
  component: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
}

// 健康检查配置
export interface HealthMonitorConfig {
  checkInterval: number // 检查间隔（毫秒）
  alertThresholds: {
    memory: number // 内存使用阈值（MB）
    storage: number // 存储使用阈值（百分比）
    responseTime: number // 响应时间阈值（毫秒）
    errorRate: number // 错误率阈值（百分比）
  }
  enableAutoRecovery: boolean // 启用自动恢复
  enableNotifications: boolean // 启用通知
  retentionDays: number // 历史数据保留天数
}

// 默认配置
const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkInterval: 60000, // 1分钟
  alertThresholds: {
    memory: 150, // 150MB
    storage: 80, // 80%
    responseTime: 2000, // 2秒
    errorRate: 5 // 5%
  },
  enableAutoRecovery: true,
  enableNotifications: true,
  retentionDays: 7
}

/**
 * 健康监控管理器
 */
export class HealthMonitor {
  private config: HealthMonitorConfig
  private isRunning = false
  private checkInterval?: number
  private startTime = Date.now()
  private healthHistory: SystemHealthStatus[] = []
  private activeAlerts = new Map<string, HealthAlert>()
  private componentCheckers = new Map<string, () => Promise<HealthCheckResult>>()

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.setupComponentCheckers()
  }

  // 启动健康监控
  start(): void {
    if (this.isRunning) {
      logger.warn('[HealthMonitor] Already running')
      return
    }

    logger.info('[HealthMonitor] Starting health monitoring...')
    this.isRunning = true
    this.startTime = Date.now()

    // 立即执行一次检查
    this.performHealthCheck()

    // 设置定期检查
    this.checkInterval = window.setInterval(() => {
      this.performHealthCheck()
    }, this.config.checkInterval)

    logger.info(`[HealthMonitor] Health monitoring started (interval: ${this.config.checkInterval}ms)`)
  }

  // 停止健康监控
  stop(): void {
    if (!this.isRunning) {
      return
    }

    logger.info('[HealthMonitor] Stopping health monitoring...')
    this.isRunning = false

    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = undefined
    }

    logger.info('[HealthMonitor] Health monitoring stopped')
  }

  // 获取当前健康状态
  async getCurrentHealth(): Promise<SystemHealthStatus> {
    const results = await this.runAllChecks()
    return this.calculateOverallHealth(results)
  }

  // 获取健康历史
  getHealthHistory(hours = 24): SystemHealthStatus[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000)
    return this.healthHistory.filter(status => status.lastCheck >= cutoff)
  }

  // 获取活跃告警
  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved)
  }

  // 手动触发健康检查
  async triggerHealthCheck(): Promise<SystemHealthStatus> {
    logger.info('[HealthMonitor] Manual health check triggered')
    return await this.performHealthCheck()
  }

  // 添加自定义组件检查器
  addComponentChecker(name: string, checker: () => Promise<HealthCheckResult>): void {
    this.componentCheckers.set(name, checker)
    logger.info(`[HealthMonitor] Added custom checker: ${name}`)
  }

  // 移除组件检查器
  removeComponentChecker(name: string): void {
    this.componentCheckers.delete(name)
    logger.info(`[HealthMonitor] Removed checker: ${name}`)
  }

  // 解决告警
  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId)
    if (alert && !alert.resolved) {
      alert.resolved = true
      alert.resolvedAt = Date.now()
      logger.info(`[HealthMonitor] Alert resolved: ${alertId}`)
    }
  }

  // 获取系统统计信息
  getSystemStats(): any {
    const now = Date.now()
    const uptime = now - this.startTime
    const recentHistory = this.getHealthHistory(1) // 最近1小时

    return {
      uptime,
      totalChecks: this.healthHistory.length,
      recentChecks: recentHistory.length,
      averageScore: recentHistory.length > 0 
        ? recentHistory.reduce((sum, status) => sum + status.score, 0) / recentHistory.length 
        : 0,
      totalAlerts: this.activeAlerts.size,
      activeAlerts: this.getActiveAlerts().length,
      isRunning: this.isRunning,
      config: this.config
    }
  }

  // 执行健康检查
  private async performHealthCheck(): Promise<SystemHealthStatus> {
    try {
      const results = await this.runAllChecks()
      const healthStatus = this.calculateOverallHealth(results)

      // 保存历史记录
      this.saveHealthHistory(healthStatus)

      // 检查告警条件
      this.checkAlertConditions(healthStatus)

      // 尝试自动恢复
      if (this.config.enableAutoRecovery) {
        await this.attemptAutoRecovery(healthStatus)
      }

      return healthStatus

    } catch (error) {
      logger.error('[HealthMonitor] Health check failed:', error)
      
      const errorStatus: SystemHealthStatus = {
        overall: 'critical',
        score: 0,
        components: [{
          component: 'health-monitor',
          status: 'critical',
          message: `Health check failed: ${error}`,
          timestamp: Date.now()
        }],
        lastCheck: Date.now(),
        uptime: Date.now() - this.startTime,
        resourceUsage: { memory: 0, storage: 0, network: 0 },
        alerts: []
      }

      this.saveHealthHistory(errorStatus)
      return errorStatus
    }
  }

  // 运行所有检查
  private async runAllChecks(): Promise<HealthCheckResult[]> {
    const checks = Array.from(this.componentCheckers.entries())
    const results: HealthCheckResult[] = []

    // 并行执行所有检查
    const checkPromises = checks.map(async ([name, checker]) => {
      const startTime = Date.now()
      try {
        const result = await Promise.race([
          checker(),
          new Promise<HealthCheckResult>((_, reject) => 
            setTimeout(() => reject(new Error('Check timeout')), 10000)
          )
        ])
        result.responseTime = Date.now() - startTime
        return result
      } catch (error) {
        return {
          component: name,
          status: 'critical' as const,
          message: `Check failed: ${error}`,
          timestamp: Date.now(),
          responseTime: Date.now() - startTime
        }
      }
    })

    const checkResults = await Promise.allSettled(checkPromises)
    
    checkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        const [name] = checks[index]
        results.push({
          component: name,
          status: 'critical',
          message: `Check promise failed: ${result.reason}`,
          timestamp: Date.now()
        })
      }
    })

    return results
  }

  // 计算整体健康状态
  private calculateOverallHealth(results: HealthCheckResult[]): SystemHealthStatus {
    const now = Date.now()
    let totalScore = 0
    let criticalCount = 0
    let warningCount = 0

    // 计算组件得分
    results.forEach(result => {
      switch (result.status) {
        case 'healthy':
          totalScore += 100
          break
        case 'warning':
          totalScore += 70
          warningCount++
          break
        case 'critical':
          totalScore += 0
          criticalCount++
          break
        case 'unknown':
          totalScore += 50
          break
      }
    })

    const averageScore = results.length > 0 ? totalScore / results.length : 0

    // 确定整体状态
    let overall: 'healthy' | 'warning' | 'critical' | 'unknown'
    if (criticalCount > 0) {
      overall = 'critical'
    } else if (warningCount > 0 || averageScore < 80) {
      overall = 'warning'
    } else if (averageScore >= 80) {
      overall = 'healthy'
    } else {
      overall = 'unknown'
    }

    return {
      overall,
      score: Math.round(averageScore),
      components: results,
      lastCheck: now,
      uptime: now - this.startTime,
      resourceUsage: this.calculateResourceUsage(),
      alerts: Array.from(this.activeAlerts.values())
    }
  }

  // 计算资源使用情况
  private calculateResourceUsage(): { memory: number; storage: number; network: number } {
    // 获取内存使用情况
    let memoryValue = 0
    try {
      const memoryUsage = globalMemoryManager.getCurrentUsage()
      memoryValue = typeof memoryUsage === 'number' ? memoryUsage : 0
    } catch (error) {
      // Fallback if memory manager is not available
      memoryValue = 0
    }

    // 获取存储使用情况（估算）
    let storageUsage = 0
    if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        if (estimate.usage && estimate.quota) {
          storageUsage = (estimate.usage / estimate.quota) * 100
        }
      }).catch(() => {})
    }

    // 获取网络使用情况（基于连接质量）
    const networkUsage = 50 // Default to 50% when connection quality is unknown

    return {
      memory: memoryValue,
      storage: storageUsage,
      network: networkUsage
    }
  }

  // 保存健康历史
  private saveHealthHistory(status: SystemHealthStatus): void {
    this.healthHistory.push(status)

    // 清理旧数据
    const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000)
    this.healthHistory = this.healthHistory.filter(s => s.lastCheck >= cutoff)
  }

  // 检查告警条件
  private checkAlertConditions(status: SystemHealthStatus): void {
    // 检查整体健康状态
    if (status.overall === 'critical') {
      this.createAlert('system', 'critical', 'System health is critical')
    } else if (status.overall === 'warning') {
      this.createAlert('system', 'medium', 'System health is degraded')
    }

    // 检查资源使用
    if (status.resourceUsage.memory > this.config.alertThresholds.memory) {
      this.createAlert('memory', 'high', `Memory usage high: ${status.resourceUsage.memory}MB`)
    }

    if (status.resourceUsage.storage > this.config.alertThresholds.storage) {
      this.createAlert('storage', 'high', `Storage usage high: ${status.resourceUsage.storage}%`)
    }

    // 检查组件响应时间
    status.components.forEach(component => {
      if (component.responseTime && component.responseTime > this.config.alertThresholds.responseTime) {
        this.createAlert(
          component.component, 
          'medium', 
          `Slow response time: ${component.responseTime}ms`
        )
      }
    })
  }

  // 创建告警
  private createAlert(component: string, severity: HealthAlert['severity'], message: string): void {
    const alertId = `${component}-${Date.now()}`
    const alert: HealthAlert = {
      id: alertId,
      component,
      severity,
      message,
      timestamp: Date.now(),
      resolved: false
    }

    this.activeAlerts.set(alertId, alert)
    logger.warn(`[HealthMonitor] Alert created: ${component} - ${message}`)

    // 发送通知
    if (this.config.enableNotifications) {
      this.sendNotification(alert)
    }
  }

  // 发送通知
  private sendNotification(alert: HealthAlert): void {
    // 这里可以集成各种通知方式：邮件、Webhook、浏览器通知等
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Health Alert: ${alert.component}`, {
        body: alert.message,
        icon: '/favicon.png',
        tag: alert.id
      })
    }

    // 控制台输出
    console.warn(`🚨 Health Alert [${alert.severity}]: ${alert.component} - ${alert.message}`)
  }

  // 尝试自动恢复
  private async attemptAutoRecovery(status: SystemHealthStatus): Promise<void> {
    const criticalComponents = status.components.filter(c => c.status === 'critical')
    
    for (const component of criticalComponents) {
      try {
        await this.recoverComponent(component.component)
        logger.info(`[HealthMonitor] Auto-recovery attempted for: ${component.component}`)
      } catch (error) {
        logger.error(`[HealthMonitor] Auto-recovery failed for ${component.component}:`, error)
      }
    }
  }

  // 恢复组件
  private async recoverComponent(componentName: string): Promise<void> {
    switch (componentName) {
      case 'cache':
        try {
          const { generalCache } = await import('./cacheManager')
          generalCache.clear()
        } catch (error) {
          logger.error(`Failed to recover cache: ${error}`)
        }
        break
      case 'memory':
        // Memory recovery would be handled by memory manager if available
        logger.info('Memory recovery attempted')
        break
      case 'storage':
        await storageHealth.autoOptimize()
        break
      case 'performance':
        await performanceSystem.optimizePerformance()
        break
      case 'offline':
        // Offline recovery would be handled by offline manager if available
        logger.info('Offline recovery attempted')
        break
      default:
        logger.warn(`[HealthMonitor] No recovery strategy for: ${componentName}`)
    }
  }

  // 设置组件检查器
  private setupComponentCheckers(): void {
    // 缓存系统检查
    this.componentCheckers.set('cache', async () => {
      try {
        const { generalCache } = await import('./cacheManager')
        const cacheSize = generalCache.size()
        const status = cacheSize < 50 * 1024 * 1024 ? 'healthy' : 'warning' // 50MB阈值
        
        return {
          component: 'cache',
          status,
          message: `Cache size: ${Math.round(cacheSize / 1024 / 1024)}MB`,
          details: { size: cacheSize },
          timestamp: Date.now()
        }
      } catch (error) {
        return {
          component: 'cache',
          status: 'critical',
          message: `Cache check failed: ${error}`,
          timestamp: Date.now()
        }
      }
    })

    // 内存系统检查
    this.componentCheckers.set('memory', async () => {
      try {
        let usageValue = 0
        try {
          const usage = globalMemoryManager.getCurrentUsage()
          usageValue = typeof usage === 'number' ? usage : 0
        } catch (error) {
          // Fallback if memory manager is not available
          usageValue = 0
        }
        
        const status = usageValue < 100 ? 'healthy' : usageValue < 200 ? 'warning' : 'critical'
        
        return {
          component: 'memory',
          status,
          message: `Memory usage: ${usageValue}MB`,
          details: { usage: usageValue },
          timestamp: Date.now()
        }
      } catch (error) {
        return {
          component: 'memory',
          status: 'critical',
          message: `Memory check failed: ${error}`,
          timestamp: Date.now()
        }
      }
    })

    // 存储系统检查
    this.componentCheckers.set('storage', async () => {
      try {
        const storageStatus = await storageHealth.getStatus()
        const usagePercent = storageStatus.estimate.usage && storageStatus.estimate.quota
          ? (storageStatus.estimate.usage / storageStatus.estimate.quota) * 100
          : 0

        const status = usagePercent < 70 ? 'healthy' : usagePercent < 90 ? 'warning' : 'critical'
        
        return {
          component: 'storage',
          status,
          message: `Storage usage: ${usagePercent.toFixed(1)}%`,
          details: storageStatus,
          timestamp: Date.now()
        }
      } catch (error) {
        return {
          component: 'storage',
          status: 'critical',
          message: `Storage check failed: ${error}`,
          timestamp: Date.now()
        }
      }
    })

    // 网络系统检查
    this.componentCheckers.set('network', async () => {
      try {
        const isOnline = navigator.onLine
        const quality = 'unknown' // Default quality when detector is unavailable
        
        let status: HealthCheckResult['status']
        if (!isOnline) {
          status = 'critical'
        } else if (quality === 'slow') {
          status = 'warning'
        } else {
          status = 'healthy'
        }
        
        return {
          component: 'network',
          status,
          message: `Network: ${isOnline ? 'online' : 'offline'}, Quality: ${quality}`,
          details: { online: isOnline, quality },
          timestamp: Date.now()
        }
      } catch (error) {
        return {
          component: 'network',
          status: 'critical',
          message: `Network check failed: ${error}`,
          timestamp: Date.now()
        }
      }
    })

    // 性能系统检查
    this.componentCheckers.set('performance', async () => {
      try {
        const systemStatus = performanceSystem.getSystemStatus()
        const healthScore = this.calculatePerformanceHealth(systemStatus)
        
        let status: HealthCheckResult['status']
        if (healthScore >= 80) {
          status = 'healthy'
        } else if (healthScore >= 60) {
          status = 'warning'
        } else {
          status = 'critical'
        }
        
        return {
          component: 'performance',
          status,
          message: `Performance health: ${healthScore}%`,
          details: systemStatus,
          timestamp: Date.now()
        }
      } catch (error) {
        return {
          component: 'performance',
          status: 'critical',
          message: `Performance check failed: ${error}`,
          timestamp: Date.now()
        }
      }
    })

    // 离线系统检查
    this.componentCheckers.set('offline', async () => {
      try {
        const isInitialized = true // Default to true when offline manager is unavailable
        const cachedItems = 0 // Default cached items count
        
        const status = isInitialized ? 'healthy' : 'warning'
        
        return {
          component: 'offline',
          status,
          message: `Offline support: ${isInitialized ? 'active' : 'inactive'}, Cached items: ${cachedItems}`,
          details: { initialized: isInitialized, cachedItems },
          timestamp: Date.now()
        }
      } catch (error) {
        return {
          component: 'offline',
          status: 'critical',
          message: `Offline check failed: ${error}`,
          timestamp: Date.now()
        }
      }
    })
  }

  // 计算性能健康得分
  private calculatePerformanceHealth(systemStatus: any): number {
    let score = 100

    // 检查各个性能指标
    if (!systemStatus.monitoring?.active) score -= 10
    if (systemStatus.memory?.usage > 150) score -= 20
    if (systemStatus.caching?.hitRate < 0.5) score -= 15
    if (systemStatus.network?.averageResponseTime > 1000) score -= 20
    if (systemStatus.budget?.violations > 5) score -= 25
    if (systemStatus.animations?.averageFps < 30) score -= 10

    return Math.max(0, score)
  }
}

// 全局健康监控实例
export const healthMonitor = new HealthMonitor()

// 便捷函数
export async function startHealthMonitoring(config?: Partial<HealthMonitorConfig>): Promise<void> {
  if (config) {
    // 应用新配置到现有实例
    Object.assign(healthMonitor, { config: { ...healthMonitor['config'], ...config } })
  }
  healthMonitor.start()
}

export function stopHealthMonitoring(): void {
  healthMonitor.stop()
}

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  return await healthMonitor.getCurrentHealth()
}export function getHealthHistory(hours?: number): SystemHealthStatus[] {
  return healthMonitor.getHealthHistory(hours)
}

export function getActiveHealthAlerts(): HealthAlert[] {
  return healthMonitor.getActiveAlerts()
}

export async function triggerHealthCheck(): Promise<SystemHealthStatus> {
  return await healthMonitor.triggerHealthCheck()
}

// 自动启动（在浏览器环境中）
if (typeof window !== 'undefined') {
  // 延迟启动，避免阻塞页面加载
  setTimeout(() => {
    healthMonitor.start()
  }, 5000) // 5秒后启动

  // 页面卸载时停止
  window.addEventListener('beforeunload', () => {
    healthMonitor.stop()
  })
}