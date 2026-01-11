/**
 * React Hook for Error Logging Integration
 * 提供React组件中使用错误日志系统的便捷接口
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  errorLogger, 
  ErrorEntry, 
  ErrorMetrics, 
  AlertNotification,
  ErrorCategory,
  ErrorSeverity,
  logError
} from '../utils/errorLogger'

export interface UseErrorLoggerOptions {
  autoRefresh?: boolean
  refreshInterval?: number
  timeWindow?: number
  category?: ErrorCategory
  severity?: ErrorSeverity
}

export interface UseErrorLoggerReturn {
  // Error logging functions
  logError: (error: Error | string, category?: ErrorCategory, severity?: ErrorSeverity, context?: any) => string
  logNetworkError: (error: Error | string, context?: any) => string
  logApiError: (error: Error | string, context?: any) => string
  logStorageError: (error: Error | string, context?: any) => string
  logAiError: (error: Error | string, context?: any) => string
  logCriticalError: (error: Error | string, context?: any) => string
  
  // Data and metrics
  errors: ErrorEntry[]
  metrics: ErrorMetrics | null
  alerts: AlertNotification[]
  
  // State
  isLoading: boolean
  lastUpdated: number | null
  
  // Actions
  refresh: () => void
  clearErrors: (options?: { category?: ErrorCategory; olderThanMs?: number }) => number
  exportErrors: (format?: 'json' | 'csv') => string
  
  // Alert management
  onAlert: (callback: (alert: AlertNotification) => void) => () => void
  dismissAlert: (alertId: string) => void
}

export const useErrorLogger = (options: UseErrorLoggerOptions = {}): UseErrorLoggerReturn => {
  const {
    autoRefresh = true,
    refreshInterval = 30000, // 30秒
    timeWindow = 60 * 60 * 1000, // 1小时
    category,
    severity
  } = options

  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [metrics, setMetrics] = useState<ErrorMetrics | null>(null)
  const [alerts, setAlerts] = useState<AlertNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const alertUnsubscribeRef = useRef<(() => void) | null>(null)

  // 刷新数据
  const refresh = useCallback(() => {
    setIsLoading(true)
    
    try {
      // 获取错误指标
      const newMetrics = errorLogger.getMetrics(timeWindow)
      setMetrics(newMetrics)

      // 获取错误列表
      const errorOptions: any = { timeWindowMs: timeWindow }
      if (category) errorOptions.category = category
      if (severity) errorOptions.severity = severity

      const newErrors = errorLogger.getErrors(errorOptions)
      setErrors(newErrors)
      
      setLastUpdated(Date.now())
    } catch (error) {
      console.error('Failed to refresh error data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [timeWindow, category, severity])

  // 设置自动刷新
  useEffect(() => {
    refresh()

    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(refresh, refreshInterval)
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [refresh, autoRefresh, refreshInterval])

  // 设置告警监听
  useEffect(() => {
    alertUnsubscribeRef.current = errorLogger.onAlert((alert) => {
      setAlerts(prev => {
        // 避免重复添加相同的告警
        if (prev.some(a => a.id === alert.id)) {
          return prev
        }
        // 保留最近20个告警
        return [alert, ...prev.slice(0, 19)]
      })
    })

    return () => {
      if (alertUnsubscribeRef.current) {
        alertUnsubscribeRef.current()
      }
    }
  }, [])

  // 错误记录函数
  const logErrorWithContext = useCallback((
    error: Error | string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: any = {}
  ) => {
    const fingerprint = logError(error, category, severity, {
      ...context,
      component: context.component || 'react-component'
    })
    
    // 触发刷新以显示新错误
    setTimeout(refresh, 100)
    
    return fingerprint
  }, [refresh])

  const logNetworkError = useCallback((error: Error | string, context: any = {}) => {
    return logErrorWithContext(error, ErrorCategory.NETWORK, ErrorSeverity.HIGH, context)
  }, [logErrorWithContext])

  const logApiError = useCallback((error: Error | string, context: any = {}) => {
    return logErrorWithContext(error, ErrorCategory.API, ErrorSeverity.MEDIUM, context)
  }, [logErrorWithContext])

  const logStorageError = useCallback((error: Error | string, context: any = {}) => {
    return logErrorWithContext(error, ErrorCategory.STORAGE, ErrorSeverity.MEDIUM, context)
  }, [logErrorWithContext])

  const logAiError = useCallback((error: Error | string, context: any = {}) => {
    return logErrorWithContext(error, ErrorCategory.AI, ErrorSeverity.MEDIUM, context)
  }, [logErrorWithContext])

  const logCriticalError = useCallback((error: Error | string, context: any = {}) => {
    return logErrorWithContext(error, ErrorCategory.UNKNOWN, ErrorSeverity.CRITICAL, context)
  }, [logErrorWithContext])

  // 清除错误
  const clearErrors = useCallback((options: { category?: ErrorCategory; olderThanMs?: number } = {}) => {
    const clearedCount = errorLogger.clearErrors(options)
    refresh() // 刷新显示
    return clearedCount
  }, [refresh])

  // 导出错误
  const exportErrors = useCallback((format: 'json' | 'csv' = 'json') => {
    return errorLogger.exportErrors(format)
  }, [])

  // 告警管理
  const onAlert = useCallback((callback: (alert: AlertNotification) => void) => {
    return errorLogger.onAlert(callback)
  }, [])

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId))
  }, [])

  return {
    // Error logging functions
    logError: logErrorWithContext,
    logNetworkError,
    logApiError,
    logStorageError,
    logAiError,
    logCriticalError,
    
    // Data and metrics
    errors,
    metrics,
    alerts,
    
    // State
    isLoading,
    lastUpdated,
    
    // Actions
    refresh,
    clearErrors,
    exportErrors,
    
    // Alert management
    onAlert,
    dismissAlert
  }
}

/**
 * React Hook for Component Error Boundary Integration
 * 为React错误边界提供错误日志集成
 */
export const useErrorBoundary = (componentName: string) => {
  const { logError } = useErrorLogger()

  const logComponentError = useCallback((error: Error, errorInfo: any) => {
    logError(error, ErrorCategory.UI, ErrorSeverity.HIGH, {
      component: componentName,
      action: 'component-error',
      errorInfo: {
        componentStack: errorInfo.componentStack,
        errorBoundary: true
      }
    })
  }, [logError, componentName])

  return { logComponentError }
}

/**
 * React Hook for Async Operation Error Handling
 * 为异步操作提供统一的错误处理
 */
export const useAsyncErrorHandler = (componentName: string) => {
  const { logError } = useErrorLogger()

  const handleAsyncError = useCallback(async <T>(
    operation: () => Promise<T>,
    options: {
      category?: ErrorCategory
      severity?: ErrorSeverity
      context?: any
      fallback?: T
      onError?: (error: Error) => void
    } = {}
  ): Promise<T | undefined> => {
    const {
      category = ErrorCategory.UNKNOWN,
      severity = ErrorSeverity.MEDIUM,
      context = {},
      fallback,
      onError
    } = options

    try {
      return await operation()
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      
      logError(errorObj, category, severity, {
        ...context,
        component: componentName,
        action: 'async-operation'
      })

      if (onError) {
        onError(errorObj)
      }

      return fallback
    }
  }, [logError, componentName])

  return { handleAsyncError }
}

/**
 * React Hook for Performance Error Monitoring
 * 监控性能相关的错误和警告
 */
export const usePerformanceErrorMonitor = (componentName: string) => {
  const { logError } = useErrorLogger()

  const logPerformanceError = useCallback((
    message: string,
    metrics: {
      duration?: number
      memoryUsage?: number
      renderCount?: number
      [key: string]: any
    } = {}
  ) => {
    logError(message, ErrorCategory.PERFORMANCE, ErrorSeverity.MEDIUM, {
      component: componentName,
      action: 'performance-issue',
      metrics
    })
  }, [logError, componentName])

  const logSlowOperation = useCallback((operationName: string, duration: number, threshold: number = 1000) => {
    if (duration > threshold) {
      logPerformanceError(`Slow operation: ${operationName}`, {
        duration,
        threshold,
        operationName
      })
    }
  }, [logPerformanceError])

  const logMemoryWarning = useCallback((memoryUsage: number, threshold: number = 50 * 1024 * 1024) => {
    if (memoryUsage > threshold) {
      logPerformanceError('High memory usage detected', {
        memoryUsage,
        threshold,
        memoryUsageMB: Math.round(memoryUsage / 1024 / 1024)
      })
    }
  }, [logPerformanceError])

  return {
    logPerformanceError,
    logSlowOperation,
    logMemoryWarning
  }
}

export default useErrorLogger