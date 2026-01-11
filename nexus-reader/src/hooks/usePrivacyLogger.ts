/**
 * 🔒 Privacy Logger React Hook
 * React integration for privacy-compliant logging system
 * **Feature: free-tier-maximization, Property 25: Privacy-Compliant Logging**
 */

import { useCallback, useEffect, useRef } from 'react'
import { 
  privacyLogger, 
  PrivacyLogUtils,
  LogLevel, 
  LogCategory, 
  PrivacyLevel,
  type PrivacyLogEntry,
  type AnonymizationConfig 
} from '../utils/privacyLogger'

// Hook configuration
export interface UsePrivacyLoggerConfig {
  autoLogPageViews?: boolean
  autoLogUserActions?: boolean
  autoLogErrors?: boolean
  sessionTracking?: boolean
  anonymizationConfig?: Partial<AnonymizationConfig>
}

// Hook return type
export interface UsePrivacyLoggerReturn {
  // Core logging methods
  log: (
    level: LogLevel,
    category: LogCategory,
    privacy: PrivacyLevel,
    message: string,
    context?: Record<string, any>
  ) => Promise<void>
  
  // Convenience methods
  debug: (category: LogCategory, message: string, context?: Record<string, any>) => Promise<void>
  info: (category: LogCategory, message: string, context?: Record<string, any>) => Promise<void>
  warn: (category: LogCategory, message: string, context?: Record<string, any>) => Promise<void>
  error: (category: LogCategory, message: string, context?: Record<string, any>) => Promise<void>
  
  // Specialized logging
  logUserAction: (action: string, details?: Record<string, any>) => Promise<void>
  logPageView: (page: string, referrer?: string) => Promise<void>
  logApiCall: (method: string, endpoint: string, statusCode: number) => Promise<void>
  logPerformance: (metric: string, value: number, unit: string) => Promise<void>
  
  // Log management
  getLogs: (filters?: Parameters<typeof privacyLogger.getLogs>[0]) => PrivacyLogEntry[]
  exportLogs: (format?: 'json' | 'csv', includePersonalData?: boolean) => Promise<string>
  clearExpiredLogs: () => Promise<number>
  
  // Privacy compliance
  getPrivacyReport: () => ReturnType<typeof privacyLogger.getPrivacyReport>
  
  // State
  isLoggingEnabled: boolean
  sessionId: string
}

/**
 * Privacy-compliant logging hook
 */
export function usePrivacyLogger(
  config: UsePrivacyLoggerConfig = {}
): UsePrivacyLoggerReturn {
  const configRef = useRef(config)
  const sessionIdRef = useRef<string>()
  const userIdRef = useRef<string>()

  // Update config ref when config changes
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Initialize session tracking
  useEffect(() => {
    if (config.sessionTracking !== false) {
      sessionIdRef.current = privacyLogger['sessionId']
    }
  }, [config.sessionTracking])

  // Auto-log page views
  useEffect(() => {
    if (config.autoLogPageViews) {
      const currentPage = window.location.pathname
      logPageView(currentPage, document.referrer)
    }
  }, [config.autoLogPageViews])

  // Auto-log errors
  useEffect(() => {
    if (config.autoLogErrors) {
      const handleError = (event: ErrorEvent) => {
        PrivacyLogUtils.logError(
          new Error(event.message),
          LogCategory.SYSTEM,
          {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        )
      }

      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        PrivacyLogUtils.logError(
          new Error(`Unhandled promise rejection: ${event.reason}`),
          LogCategory.SYSTEM,
          { reason: event.reason }
        )
      }

      window.addEventListener('error', handleError)
      window.addEventListener('unhandledrejection', handleUnhandledRejection)

      return () => {
        window.removeEventListener('error', handleError)
        window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      }
    }
  }, [config.autoLogErrors])

  // Core logging method
  const log = useCallback(async (
    level: LogLevel,
    category: LogCategory,
    privacy: PrivacyLevel,
    message: string,
    context?: Record<string, any>
  ) => {
    const enhancedContext = {
      ...context,
      userId: userIdRef.current,
      sessionId: sessionIdRef.current,
      url: window.location.href,
      userAgent: navigator.userAgent
    }

    await privacyLogger.log(level, category, privacy, message, enhancedContext)
  }, [])

  // Convenience methods
  const debug = useCallback(async (
    category: LogCategory,
    message: string,
    context?: Record<string, any>
  ) => {
    await log(LogLevel.DEBUG, category, PrivacyLevel.INTERNAL, message, context)
  }, [log])

  const info = useCallback(async (
    category: LogCategory,
    message: string,
    context?: Record<string, any>
  ) => {
    await log(LogLevel.INFO, category, PrivacyLevel.PUBLIC, message, context)
  }, [log])

  const warn = useCallback(async (
    category: LogCategory,
    message: string,
    context?: Record<string, any>
  ) => {
    await log(LogLevel.WARN, category, PrivacyLevel.INTERNAL, message, context)
  }, [log])

  const error = useCallback(async (
    category: LogCategory,
    message: string,
    context?: Record<string, any>
  ) => {
    await log(LogLevel.ERROR, category, PrivacyLevel.CONFIDENTIAL, message, context)
  }, [log])

  // Specialized logging methods
  const logUserAction = useCallback(async (
    action: string,
    details?: Record<string, any>
  ) => {
    if (config.autoLogUserActions !== false) {
      await privacyLogger.logUserAction(
        action,
        userIdRef.current || 'anonymous',
        details
      )
    }
  }, [config.autoLogUserActions])

  const logPageView = useCallback(async (
    page: string,
    referrer?: string
  ) => {
    await log(
      LogLevel.INFO,
      LogCategory.USER_ACTION,
      PrivacyLevel.INTERNAL,
      `Page view: ${page}`,
      {
        page,
        referrer,
        timestamp: Date.now()
      }
    )
  }, [log])

  const logApiCall = useCallback(async (
    method: string,
    endpoint: string,
    statusCode: number
  ) => {
    await PrivacyLogUtils.logApiRequest(
      method,
      endpoint,
      statusCode,
      userIdRef.current
    )
  }, [])

  const logPerformance = useCallback(async (
    metric: string,
    value: number,
    unit: string
  ) => {
    await PrivacyLogUtils.logPerformance(metric, value, unit, {
      page: window.location.pathname,
      sessionId: sessionIdRef.current
    })
  }, [])

  // Log management methods
  const getLogs = useCallback((
    filters?: Parameters<typeof privacyLogger.getLogs>[0]
  ) => {
    return privacyLogger.getLogs(filters)
  }, [])

  const exportLogs = useCallback(async (
    format: 'json' | 'csv' = 'json',
    includePersonalData: boolean = false
  ) => {
    return await privacyLogger.exportLogs(format, includePersonalData)
  }, [])

  const clearExpiredLogs = useCallback(async () => {
    return await privacyLogger.clearExpiredLogs()
  }, [])

  const getPrivacyReport = useCallback(() => {
    return privacyLogger.getPrivacyReport()
  }, [])

  // Set user ID for logging context
  const setUserId = useCallback((userId: string | undefined) => {
    userIdRef.current = userId
  }, [])

  return {
    // Core methods
    log,
    debug,
    info,
    warn,
    error,
    
    // Specialized methods
    logUserAction,
    logPageView,
    logApiCall,
    logPerformance,
    
    // Management methods
    getLogs,
    exportLogs,
    clearExpiredLogs,
    getPrivacyReport,
    
    // State
    isLoggingEnabled: true,
    sessionId: sessionIdRef.current || '',
    
    // Additional utilities
    setUserId
  }
}

/**
 * Hook for privacy compliance monitoring
 */
export function usePrivacyCompliance() {
  const getComplianceStatus = useCallback(() => {
    const report = privacyLogger.getPrivacyReport()
    
    return {
      isCompliant: report.retentionCompliance && 
                   report.encryptionStatus && 
                   report.anonymizationStatus,
      report,
      recommendations: generateComplianceRecommendations(report)
    }
  }, [])

  const auditLogs = useCallback(async () => {
    const logs = privacyLogger.getLogs()
    const issues: string[] = []
    
    // Check for potential PII in logs
    for (const log of logs) {
      if (log.privacy === PrivacyLevel.PERSONAL && !log.message.includes('[REDACTED]')) {
        issues.push(`Log ${log.id} may contain unredacted personal data`)
      }
      
      if (log.context && typeof log.context === 'object') {
        const contextStr = JSON.stringify(log.context)
        if (contextStr.includes('@') && !contextStr.includes('[EMAIL]')) {
          issues.push(`Log ${log.id} may contain unredacted email addresses`)
        }
      }
    }
    
    return {
      totalLogs: logs.length,
      issues,
      isCompliant: issues.length === 0
    }
  }, [])

  return {
    getComplianceStatus,
    auditLogs
  }
}

/**
 * Generate compliance recommendations
 */
function generateComplianceRecommendations(
  report: ReturnType<typeof privacyLogger.getPrivacyReport>
): string[] {
  const recommendations: string[] = []
  
  if (!report.retentionCompliance) {
    recommendations.push('Consider reducing log retention period or clearing old logs')
  }
  
  if (!report.encryptionStatus) {
    recommendations.push('Enable encryption for personal data logs')
  }
  
  if (!report.anonymizationStatus) {
    recommendations.push('Enable user ID and device ID anonymization')
  }
  
  const personalLogs = report.logsByPrivacyLevel.personal || 0
  if (personalLogs > 100) {
    recommendations.push('High number of personal data logs - consider data minimization')
  }
  
  return recommendations
}

// Export types
export type { UsePrivacyLoggerConfig, UsePrivacyLoggerReturn }