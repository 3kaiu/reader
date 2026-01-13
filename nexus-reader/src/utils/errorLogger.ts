/**
 * 综合错误日志和告警系统
 * 实现全面的错误记录、分类、聚合和自动告警机制
 */

import { logger } from './logger'
import { secureRandomString } from './secureRandom'

export interface ErrorContext {
  userId?: string
  sessionId?: string
  url?: string
  userAgent?: string
  timestamp?: number
  component?: string
  action?: string
  metadata?: Record<string, any>
}

export interface ErrorMetrics {
  errorCount: number
  errorRate: number
  lastErrorTime: number
  topErrors: Array<{
    message: string
    count: number
    lastOccurrence: number
  }>
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  API = 'api',
  UI = 'ui',
  STORAGE = 'storage',
  AI = 'ai',
  SYNC = 'sync',
  AUTH = 'auth',
  PERFORMANCE = 'performance',
  UNKNOWN = 'unknown'
}

export interface ErrorEntry {
  id: string
  message: string
  stack?: string
  category: ErrorCategory
  severity: ErrorSeverity
  context: ErrorContext
  timestamp: number
  fingerprint: string
  count: number
}

export interface AlertRule {
  id: string
  name: string
  condition: (metrics: ErrorMetrics, errors: ErrorEntry[]) => boolean
  severity: ErrorSeverity
  cooldownMs: number
  lastTriggered?: number
  enabled: boolean
}

class ErrorLogger {
  private errors: Map<string, ErrorEntry> = new Map()
  private alertRules: AlertRule[] = []
  private alertCallbacks: Array<(alert: AlertNotification) => void> = []
  private maxErrors = 1000
  private cleanupInterval = 60 * 60 * 1000 // 1 hour
  private metricsWindow = 60 * 60 * 1000 // 1 hour for metrics calculation
  private cleanupHistory: Array<{ timestamp: number; count: number }> = []
  private cleanupTimer?: NodeJS.Timeout

  constructor() {
    this.initializeDefaultAlertRules()
    this.startCleanupTimer()
  }

  /**
   * 记录错误
   */
  logError(
    error: Error | string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {}
  ): string {
    const timestamp = Date.now()
    const message = typeof error === 'string' ? error : error.message
    const stack = typeof error === 'string' ? undefined : error.stack

    // 生成错误指纹用于去重
    const fingerprint = this.generateFingerprint(message, stack, category)

    // 更新或创建错误条目
    const existingError = this.errors.get(fingerprint)
    if (existingError) {
      existingError.count++
      existingError.timestamp = timestamp
      existingError.context = { ...existingError.context, ...context }
    } else {
      const errorEntry: ErrorEntry = {
        id: this.generateId(),
        message,
        stack,
        category,
        severity,
        context: {
          ...context,
          timestamp: timestamp,
          sessionId: context.sessionId || this.getSessionId(),
          url: context.url || (typeof window !== 'undefined' ? window.location.href : 'test-environment'),
          userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'test-user-agent')
        },
        timestamp,
        fingerprint,
        count: 1
      }

      this.errors.set(fingerprint, errorEntry)
    }

    // 记录到控制台和外部日志服务
    this.writeToLog(this.errors.get(fingerprint)!)

    // 检查告警规则
    this.checkAlertRules()

    return fingerprint
  }

  /**
   * 批量记录错误
   */
  logErrors(errors: Array<{
    error: Error | string
    category?: ErrorCategory
    severity?: ErrorSeverity
    context?: ErrorContext
  }>): string[] {
    return errors.map(({ error, category, severity, context }) =>
      this.logError(error, category, severity, context)
    )
  }

  /**
   * 获取错误指标
   */
  getMetrics(timeWindowMs: number = this.metricsWindow): ErrorMetrics {
    const now = Date.now()
    const windowStart = now - timeWindowMs

    const recentErrors = Array.from(this.errors.values())
      .filter(error => error.timestamp >= windowStart)

    const errorCount = recentErrors.reduce((sum, error) => sum + error.count, 0)
    const errorRate = errorCount / (timeWindowMs / 1000) // errors per second

    const lastErrorTime = Math.max(
      ...recentErrors.map(error => error.timestamp),
      0
    )

    // 获取最常见的错误
    const topErrors = recentErrors
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(error => ({
        message: error.message,
        count: error.count,
        lastOccurrence: error.timestamp
      }))

    return {
      errorCount,
      errorRate,
      lastErrorTime,
      topErrors
    }
  }

  /**
   * 获取错误列表
   */
  getErrors(options: {
    category?: ErrorCategory
    severity?: ErrorSeverity
    timeWindowMs?: number
    limit?: number
  } = {}): ErrorEntry[] {
    const {
      category,
      severity,
      timeWindowMs = this.metricsWindow,
      limit = 100
    } = options

    const now = Date.now()
    const windowStart = now - timeWindowMs

    let errors = Array.from(this.errors.values())
      .filter(error => error.timestamp >= windowStart)

    if (category) {
      errors = errors.filter(error => error.category === category)
    }

    if (severity) {
      errors = errors.filter(error => error.severity === severity)
    }

    return errors
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * 添加告警规则
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule)
  }

  /**
   * 移除告警规则
   */
  removeAlertRule(ruleId: string): void {
    this.alertRules = this.alertRules.filter(rule => rule.id !== ruleId)
  }

  /**
   * 订阅告警通知
   */
  onAlert(callback: (alert: AlertNotification) => void): () => void {
    this.alertCallbacks.push(callback)
    return () => {
      const index = this.alertCallbacks.indexOf(callback)
      if (index > -1) {
        this.alertCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Reset error logger state (for testing)
   */
  reset(): void {
    this.errors.clear()
    this.alertRules = []
    this.alertCallbacks = []
    this.cleanupHistory = []
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    this.initializeDefaultAlertRules()
    this.startCleanupTimer()
  }

  /**
   * Get alert rules (for testing)
   */
  getAlertRules(): AlertRule[] {
    return [...this.alertRules]
  }

  /**
   * 清除错误
   */
  clearErrors(options: {
    category?: ErrorCategory
    olderThanMs?: number
  } = {}): number {
    const { category, olderThanMs } = options
    const now = Date.now()
    let clearedCount = 0

    // If no options provided, clear all errors
    if (!category && !olderThanMs) {
      clearedCount = this.errors.size
      this.errors.clear()
      this.cleanupHistory.push({ timestamp: now, count: clearedCount })
      return clearedCount
    }

    for (const [fingerprint, error] of this.errors.entries()) {
      let shouldClear = false

      if (category && error.category === category) {
        shouldClear = true
      }

      if (olderThanMs && (now - error.timestamp) > olderThanMs) {
        shouldClear = true
      }

      if (shouldClear) {
        this.errors.delete(fingerprint)
        clearedCount++
      }
    }

    if (clearedCount > 0) {
      this.cleanupHistory.push({ timestamp: now, count: clearedCount })
    }

    return clearedCount
  }

  /**
   * 导出错误数据
   */
  exportErrors(format: 'json' | 'csv' = 'json'): string {
    const errors = Array.from(this.errors.values())

    if (format === 'csv') {
      const headers = ['timestamp', 'category', 'severity', 'message', 'count', 'url']
      const rows = errors.map(error => [
        new Date(error.timestamp).toISOString(),
        error.category,
        error.severity,
        error.message.replace(/"/g, '""'),
        error.count,
        error.context.url || ''
      ])

      return [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n')
    }

    return JSON.stringify(errors, null, 2)
  }

  private generateFingerprint(message: string, stack?: string, category?: ErrorCategory): string {
    // 创建错误指纹用于去重 - 只基于消息和类别，不包含堆栈的具体行号
    const stackFirstLine = stack?.split('\n')[0] || ''
    const key = `${category || 'unknown'}:${message}:${stackFirstLine.replace(/:\d+:\d+/g, '')}`

    // 使用更简单的哈希方法确保一致性
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36).substring(0, 16)
  }

  private generateId(): string {
    return `error_${Date.now()}_${secureRandomString(7)}`
  }

  private getSessionId(): string {
    // 获取或生成会话ID
    if (typeof sessionStorage === 'undefined') {
      // 测试环境或Node.js环境
      return `test_session_${Date.now()}_${secureRandomString(7)}`
    }

    let sessionId = sessionStorage.getItem('nexus_session_id')
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${secureRandomString(7)}`
      sessionStorage.setItem('nexus_session_id', sessionId)
    }
    return sessionId
  }

  private writeToLog(error: ErrorEntry): void {
    // 写入到控制台
    const logMessage = `[${error.category.toUpperCase()}] ${error.message}`
    const logContext = {
      fingerprint: error.fingerprint,
      count: error.count,
      context: error.context
    }

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(logMessage, new Error(error.message), logContext)
        break
      case ErrorSeverity.HIGH:
        logger.error(logMessage, new Error(error.message), logContext)
        break
      case ErrorSeverity.MEDIUM:
        logger.warn(logMessage, logContext)
        break
      case ErrorSeverity.LOW:
        logger.info(logMessage, logContext)
        break
    }

    // 发送到外部日志服务（生产环境）
    if (!import.meta.env.DEV) {
      this.sendToExternalLogging(error)
    }
  }

  private async sendToExternalLogging(_error: ErrorEntry): Promise<void> {
    // TODO: 实现外部日志服务集成
    // 当前后端无对应端点，暂时禁用
  }

  private initializeDefaultAlertRules(): void {
    // 高错误率告警
    this.addAlertRule({
      id: 'high_error_rate',
      name: '高错误率告警',
      condition: (metrics) => metrics.errorRate > 1, // 每秒超过1个错误
      severity: ErrorSeverity.HIGH,
      cooldownMs: 5 * 60 * 1000, // 5分钟冷却
      enabled: true
    })

    // 关键错误告警
    this.addAlertRule({
      id: 'critical_errors',
      name: '关键错误告警',
      condition: (_, errors) => errors.some(error =>
        error.severity === ErrorSeverity.CRITICAL &&
        (Date.now() - error.timestamp) < 60000 // 1分钟内
      ),
      severity: ErrorSeverity.CRITICAL,
      cooldownMs: 2 * 60 * 1000, // 2分钟冷却
      enabled: true
    })

    // API错误激增告警
    this.addAlertRule({
      id: 'api_error_spike',
      name: 'API错误激增告警',
      condition: (_, errors) => {
        const apiErrors = errors.filter(error => error.category === ErrorCategory.API)
        const recentApiErrors = apiErrors.filter(error =>
          (Date.now() - error.timestamp) < 5 * 60 * 1000 // 5分钟内
        )
        return recentApiErrors.length > 10
      },
      severity: ErrorSeverity.HIGH,
      cooldownMs: 10 * 60 * 1000, // 10分钟冷却
      enabled: true
    })

    // 存储错误告警
    this.addAlertRule({
      id: 'storage_errors',
      name: '存储错误告警',
      condition: (_, errors) => errors.some(error =>
        error.category === ErrorCategory.STORAGE &&
        error.severity >= ErrorSeverity.MEDIUM &&
        (Date.now() - error.timestamp) < 60000 // 1分钟内
      ),
      severity: ErrorSeverity.MEDIUM,
      cooldownMs: 5 * 60 * 1000, // 5分钟冷却
      enabled: true
    })
  }

  private checkAlertRules(): void {
    const now = Date.now()
    const metrics = this.getMetrics()
    const recentErrors = this.getErrors({ timeWindowMs: 10 * 60 * 1000 }) // 10分钟窗口

    for (const rule of this.alertRules) {
      if (!rule.enabled) continue

      // 检查冷却时间
      if (rule.lastTriggered && (now - rule.lastTriggered) < rule.cooldownMs) {
        continue
      }

      // 检查告警条件
      if (rule.condition(metrics, recentErrors)) {
        rule.lastTriggered = now
        this.triggerAlert(rule, metrics, recentErrors)
      }
    }
  }

  private triggerAlert(rule: AlertRule, metrics: ErrorMetrics, errors: ErrorEntry[]): void {
    const alert: AlertNotification = {
      id: `alert_${Date.now()}_${secureRandomString(7)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      timestamp: Date.now(),
      metrics,
      relatedErrors: errors.slice(0, 5), // 最近5个相关错误
      message: this.generateAlertMessage(rule, metrics, errors)
    }

    // 通知所有订阅者
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert)
      } catch (error) {
        console.error('Error in alert callback:', error)
      }
    })

    // 记录告警本身
    logger.warn(`Alert triggered: ${rule.name}`, {
      alertId: alert.id,
      metrics,
      errorCount: errors.length
    })
  }

  private generateAlertMessage(rule: AlertRule, metrics: ErrorMetrics, errors: ErrorEntry[]): string {
    switch (rule.id) {
      case 'high_error_rate':
        return `检测到高错误率: ${metrics.errorRate.toFixed(2)} 错误/秒，总计 ${metrics.errorCount} 个错误`

      case 'critical_errors':
        const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL)
        return `检测到 ${criticalErrors.length} 个关键错误，需要立即处理`

      case 'api_error_spike':
        const apiErrors = errors.filter(e => e.category === ErrorCategory.API)
        return `API错误激增: 5分钟内发生 ${apiErrors.length} 个API错误`

      case 'storage_errors':
        const storageErrors = errors.filter(e => e.category === ErrorCategory.STORAGE)
        return `存储系统错误: 检测到 ${storageErrors.length} 个存储相关错误`

      default:
        return `告警规则 "${rule.name}" 被触发，错误数量: ${errors.length}`
    }
  }

  private startCleanupTimer(): void {
    // Clear any existing timer first
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(() => {
      const oldErrorsThreshold = Date.now() - (24 * 60 * 60 * 1000) // 24小时前
      const clearedCount = this.clearErrors({ olderThanMs: oldErrorsThreshold })

      // 如果错误数量过多，清理最旧的错误
      if (this.errors.size > this.maxErrors) {
        const sortedErrors = Array.from(this.errors.entries())
          .sort(([, a], [, b]) => a.timestamp - b.timestamp)

        const toDelete = sortedErrors.slice(0, this.errors.size - this.maxErrors)
        toDelete.forEach(([fingerprint]) => {
          this.errors.delete(fingerprint)
        })

        if (toDelete.length > 0) {
          this.cleanupHistory.push({
            timestamp: Date.now(),
            count: clearedCount + toDelete.length
          })
        }
      }
    }, this.cleanupInterval)
  }
}

export interface AlertNotification {
  id: string
  ruleId: string
  ruleName: string
  severity: ErrorSeverity
  timestamp: number
  metrics: ErrorMetrics
  relatedErrors: ErrorEntry[]
  message: string
}

// 全局错误日志实例
export const errorLogger = new ErrorLogger()

// 便捷函数
export const logError = (
  error: Error | string,
  category?: ErrorCategory,
  severity?: ErrorSeverity,
  context?: ErrorContext
) => errorLogger.logError(error, category, severity, context)

export const logNetworkError = (error: Error | string, context?: ErrorContext) =>
  errorLogger.logError(error, ErrorCategory.NETWORK, ErrorSeverity.HIGH, context)

export const logApiError = (error: Error | string, context?: ErrorContext) =>
  errorLogger.logError(error, ErrorCategory.API, ErrorSeverity.MEDIUM, context)

export const logStorageError = (error: Error | string, context?: ErrorContext) =>
  errorLogger.logError(error, ErrorCategory.STORAGE, ErrorSeverity.MEDIUM, context)

export const logAiError = (error: Error | string, context?: ErrorContext) =>
  errorLogger.logError(error, ErrorCategory.AI, ErrorSeverity.MEDIUM, context)

export const logCriticalError = (error: Error | string, context?: ErrorContext) =>
  errorLogger.logError(error, ErrorCategory.UNKNOWN, ErrorSeverity.CRITICAL, context)

// 全局错误处理器
if (typeof window !== 'undefined') {
  // 捕获未处理的Promise拒绝
  window.addEventListener('unhandledrejection', (event) => {
    logError(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      ErrorCategory.UNKNOWN,
      ErrorSeverity.HIGH,
      { component: 'global', action: 'unhandledrejection' }
    )
  })

  // 捕获未处理的错误
  window.addEventListener('error', (event) => {
    logError(
      event.error || new Error(event.message),
      ErrorCategory.UNKNOWN,
      ErrorSeverity.HIGH,
      {
        component: 'global',
        action: 'error',
        url: event.filename,
        metadata: {
          line: event.lineno,
          column: event.colno
        }
      }
    )
  })
}

export default errorLogger