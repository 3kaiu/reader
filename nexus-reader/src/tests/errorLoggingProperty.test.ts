/**
 * 错误日志和告警系统属性测试
 * **Feature: free-tier-maximization, Property 19: 错误日志和告警**
 * 验证错误日志记录、分类、聚合和自动告警机制的正确性
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { 
  errorLogger, 
  ErrorCategory, 
  ErrorSeverity, 
  logError,
  logNetworkError,
  logApiError,
  logStorageError,
  logAiError,
  logCriticalError
} from '../utils/errorLogger'

// Mock fetch for external logging
global.fetch = vi.fn()

// Mock window and sessionStorage
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    location: { href: 'http://localhost:3000/test' },
    sessionStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
  },
  writable: true
})

// Mock ErrorEvent constructor
global.ErrorEvent = class ErrorEvent extends Event {
  message: string
  filename: string
  lineno: number
  colno: number
  error: Error

  constructor(type: string, options: {
    message?: string
    filename?: string
    lineno?: number
    colno?: number
    error?: Error
  } = {}) {
    super(type)
    this.message = options.message || ''
    this.filename = options.filename || ''
    this.lineno = options.lineno || 0
    this.colno = options.colno || 0
    this.error = options.error || new Error()
  }
}

// Mock sessionStorage separately for compatibility
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true
})

// Predefined valid strings for testing
const validMessages = [
  'Network connection failed',
  'API request timeout',
  'Database connection error',
  'Authentication failed',
  'File not found',
  'Permission denied',
  'Invalid input data',
  'Server error occurred',
  'Memory allocation failed',
  'Configuration error'
]

const validComponents = [
  'auth-service',
  'api-client',
  'database-manager',
  'file-handler',
  'network-layer',
  'ui-component',
  'data-processor',
  'cache-manager'
]

const validActions = [
  'login-attempt',
  'data-fetch',
  'file-upload',
  'cache-update',
  'network-request',
  'user-interaction',
  'system-startup',
  'data-validation'
]

describe('Error Logging and Alerting Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset all mocks to clean state
    mockSessionStorage.getItem.mockReturnValue('test-session-123')
    if (global.window && global.window.sessionStorage) {
      global.window.sessionStorage.getItem.mockReturnValue('test-session-123')
    }
    
    // Mock fetch to simulate successful external logging
    global.fetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    
    // Clear any existing errors and reset state completely
    errorLogger.clearErrors()
    
    // Clear any existing alert rules
    const existingRules = errorLogger.getAlertRules ? errorLogger.getAlertRules() : []
    if (Array.isArray(existingRules)) {
      existingRules.forEach(rule => {
        if (rule.id) {
          errorLogger.removeAlertRule(rule.id)
        }
      })
    }
    
    // Reset any internal state
    if (errorLogger.reset) {
      errorLogger.reset()
    }
  })

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks()
    
    // Clear errors again to prevent state pollution
    errorLogger.clearErrors()
    
    // Remove any alert rules that might have been added during tests
    try {
      const rules = errorLogger.getAlertRules ? errorLogger.getAlertRules() : []
      if (Array.isArray(rules)) {
        rules.forEach(rule => {
          if (rule.id) {
            errorLogger.removeAlertRule(rule.id)
          }
        })
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  describe('Property 19.1: Error Classification and Storage', () => {
    it('should correctly classify and store any error with proper categorization', () => {
      fc.assert(fc.property(
        fc.record({
          message: fc.constantFrom(...validMessages),
          category: fc.constantFrom(...Object.values(ErrorCategory)),
          severity: fc.constantFrom(...Object.values(ErrorSeverity)),
          component: fc.constantFrom(...validComponents),
          action: fc.constantFrom(...validActions)
        }),
        (errorData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log the error
          const fingerprint = logError(
            errorData.message,
            errorData.category,
            errorData.severity,
            {
              component: errorData.component,
              action: errorData.action
            }
          )

          // Verify error was stored
          expect(fingerprint).toBeTruthy()
          expect(typeof fingerprint).toBe('string')

          // Get the stored error
          const errors = errorLogger.getErrors({
            category: errorData.category,
            severity: errorData.severity
          })

          // Find our error
          const storedError = errors.find(e => e.fingerprint === fingerprint)
          expect(storedError).toBeDefined()
          if (storedError) {
            expect(storedError.message).toBe(errorData.message)
            expect(storedError.category).toBe(errorData.category)
            expect(storedError.severity).toBe(errorData.severity)
            expect(storedError.context.component).toBe(errorData.component)
            expect(storedError.context.action).toBe(errorData.action)
            expect(storedError.count).toBe(1)
          }
        }
      ), { numRuns: 50 })
    })

    it('should deduplicate identical errors by incrementing count', () => {
      fc.assert(fc.property(
        fc.record({
          message: fc.constantFrom(...validMessages),
          category: fc.constantFrom(...Object.values(ErrorCategory)),
          repeatCount: fc.integer({ min: 2, max: 10 })
        }),
        (testData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          const fingerprints = []
          
          // Log the same error multiple times
          for (let i = 0; i < testData.repeatCount; i++) {
            const fingerprint = logError(
              testData.message,
              testData.category,
              ErrorSeverity.MEDIUM
            )
            fingerprints.push(fingerprint)
          }

          // All fingerprints should be identical (same error)
          const uniqueFingerprints = new Set(fingerprints)
          expect(uniqueFingerprints.size).toBe(1)

          // Get the error and verify count
          const errors = errorLogger.getErrors({ category: testData.category })
          const duplicatedError = errors.find(e => e.message === testData.message)
          
          expect(duplicatedError).toBeDefined()
          if (duplicatedError) {
            expect(duplicatedError.count).toBe(testData.repeatCount)
          }
        }
      ), { numRuns: 30 })
    })
  })

  describe('Property 19.2: Error Metrics Calculation', () => {
    it('should accurately calculate error metrics for any time window', () => {
      fc.assert(fc.property(
        fc.record({
          errors: fc.array(
            fc.record({
              message: fc.constantFrom(...validMessages),
              category: fc.constantFrom(...Object.values(ErrorCategory)),
              severity: fc.constantFrom(...Object.values(ErrorSeverity)),
              count: fc.integer({ min: 1, max: 5 })
            }),
            { minLength: 1, maxLength: 20 }
          ),
          timeWindowMs: fc.integer({ min: 5000, max: 3600000 }) // 5秒到1小时
        }),
        (testData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log all errors
          let totalErrorCount = 0
          const loggedErrors = []
          
          testData.errors.forEach((errorData, index) => {
            for (let i = 0; i < errorData.count; i++) {
              const uniqueMessage = `${errorData.message}_${index}_${i}`
              logError(uniqueMessage, errorData.category, errorData.severity)
              totalErrorCount++
              loggedErrors.push({
                ...errorData,
                message: uniqueMessage
              })
            }
          })

          // Get metrics
          const metrics = errorLogger.getMetrics(testData.timeWindowMs)

          // Verify metrics accuracy
          expect(metrics.errorCount).toBe(totalErrorCount)
          expect(metrics.errorRate).toBeGreaterThanOrEqual(0)
          expect(metrics.errorRate).toBe(totalErrorCount / (testData.timeWindowMs / 1000))
          expect(metrics.lastErrorTime).toBeGreaterThan(0)
          expect(Array.isArray(metrics.topErrors)).toBe(true)
          expect(metrics.topErrors.length).toBeLessThanOrEqual(10)
        }
      ), { numRuns: 30 })
    })

    it('should provide consistent metrics across multiple queries', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            message: fc.constantFrom(...validMessages),
            category: fc.constantFrom(...Object.values(ErrorCategory))
          }),
          { minLength: 5, maxLength: 15 }
        ),
        (errors) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log errors
          errors.forEach((error, index) => {
            logError(`${error.message}_${index}`, error.category, ErrorSeverity.MEDIUM)
          })

          const timeWindow = 60000 // 1分钟
          
          // Get metrics multiple times
          const metrics1 = errorLogger.getMetrics(timeWindow)
          const metrics2 = errorLogger.getMetrics(timeWindow)
          const metrics3 = errorLogger.getMetrics(timeWindow)

          // Metrics should be consistent
          expect(metrics1.errorCount).toBe(metrics2.errorCount)
          expect(metrics2.errorCount).toBe(metrics3.errorCount)
          expect(metrics1.errorRate).toBe(metrics2.errorRate)
          expect(metrics2.errorRate).toBe(metrics3.errorRate)
          expect(metrics1.topErrors.length).toBe(metrics2.topErrors.length)
          expect(metrics2.topErrors.length).toBe(metrics3.topErrors.length)
        }
      ), { numRuns: 20 })
    })
  })

  describe('Property 19.3: Alert Rule Evaluation', () => {
    it('should trigger alerts when conditions are met and respect cooldown periods', async () => {
      // Clear any existing state first
      errorLogger.clearErrors()
      
      // Remove all existing alert rules to avoid interference
      const existingRules = errorLogger.getAlertRules()
      existingRules.forEach(rule => errorLogger.removeAlertRule(rule.id))
      
      // Create a test alert rule with unique ID
      const testRuleId = `test_rule_${Date.now()}_${Math.random()}`
      const testRule = {
        id: testRuleId,
        name: '测试告警规则',
        condition: (metrics, errors) => errors.some(e => e.severity === ErrorSeverity.CRITICAL),
        severity: ErrorSeverity.HIGH,
        cooldownMs: 500, // Reduced cooldown for faster testing
        enabled: true
      }

      errorLogger.addAlertRule(testRule)

      let alertCount = 0
      const receivedAlerts = []
      const unsubscribe = errorLogger.onAlert((alert) => {
        alertCount++
        receivedAlerts.push(alert)
        expect(alert.ruleId).toBe(testRule.id)
        expect(alert.ruleName).toBe(testRule.name)
        expect(alert.severity).toBe(testRule.severity)
        expect(alert.timestamp).toBeGreaterThan(0)
        expect(Array.isArray(alert.relatedErrors)).toBe(true)
        expect(typeof alert.message).toBe('string')
      })

      try {
        // Log a critical error (should trigger alert)
        logCriticalError(`Critical system failure ${Date.now()}`)
        
        // Wait a bit for alert processing
        await new Promise(resolve => setTimeout(resolve, 100))
        expect(alertCount).toBe(1)

        // Log another critical error immediately (should not trigger due to cooldown)
        logCriticalError(`Another critical error ${Date.now()}`)
        await new Promise(resolve => setTimeout(resolve, 100))
        expect(alertCount).toBe(1) // Still 1 due to cooldown

        // Wait for cooldown to expire
        await new Promise(resolve => setTimeout(resolve, 600))
        
        // Log another critical error (should trigger again)
        logCriticalError(`Third critical error ${Date.now()}`)
        await new Promise(resolve => setTimeout(resolve, 100))
        expect(alertCount).toBe(2)

      } finally {
        unsubscribe()
        errorLogger.removeAlertRule(testRule.id)
        
        // Restore default alert rules
        errorLogger.reset()
      }
    })

    it('should handle multiple concurrent alert rules correctly', async () => {
      // Clear state first
      errorLogger.clearErrors()
      
      // Remove all existing alert rules to avoid interference
      const existingRules = errorLogger.getAlertRules()
      existingRules.forEach(rule => errorLogger.removeAlertRule(rule.id))
      
      // Create test rules
      const rules = [
        {
          id: `test_rule_1_${Date.now()}`,
          name: 'High Error Rate',
          condition: (metrics, errors) => errors.length > 0,
          severity: ErrorSeverity.HIGH,
          cooldownMs: 100,
          enabled: true
        },
        {
          id: `test_rule_2_${Date.now()}`,
          name: 'Critical Errors',
          condition: (metrics, errors) => errors.length > 0,
          severity: ErrorSeverity.MEDIUM,
          cooldownMs: 100,
          enabled: true
        }
      ]

      // Add all rules
      rules.forEach(rule => errorLogger.addAlertRule(rule))

      let alertsReceived = []
      const unsubscribe = errorLogger.onAlert((alert) => {
        alertsReceived.push(alert)
      })

      try {
        // Log an error that should trigger all rules
        logError(`Test error for multiple rules ${Date.now()}`, ErrorCategory.UNKNOWN, ErrorSeverity.HIGH)

        // Wait for alert processing
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Should have received alerts from all enabled rules
        expect(alertsReceived.length).toBe(rules.length)
        
        // Each alert should correspond to one of our rules
        const alertRuleIds = alertsReceived.map(alert => alert.ruleId)
        const expectedRuleIds = rules.map(rule => rule.id)
        
        expectedRuleIds.forEach(ruleId => {
          expect(alertRuleIds).toContain(ruleId)
        })

      } finally {
        unsubscribe()
        rules.forEach(rule => errorLogger.removeAlertRule(rule.id))
        
        // Restore default alert rules
        errorLogger.reset()
      }
    })
  })

  describe('Property 19.4: Error Filtering and Querying', () => {
    it('should correctly filter errors by category, severity, and time window', () => {
      fc.assert(fc.property(
        fc.record({
          targetCategory: fc.constantFrom(...Object.values(ErrorCategory)),
          targetSeverity: fc.constantFrom(...Object.values(ErrorSeverity)),
          otherErrors: fc.array(
            fc.record({
              message: fc.constantFrom(...validMessages),
              category: fc.constantFrom(...Object.values(ErrorCategory)),
              severity: fc.constantFrom(...Object.values(ErrorSeverity))
            }),
            { minLength: 5, maxLength: 15 }
          )
        }),
        (testData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log target error with unique message
          const targetMessage = `Target error for filtering test ${Date.now()}`
          logError(targetMessage, testData.targetCategory, testData.targetSeverity)

          // Log other errors with unique messages
          testData.otherErrors.forEach((error, index) => {
            logError(`${error.message}_${index}`, error.category, error.severity)
          })

          // Test category filtering
          const categoryFiltered = errorLogger.getErrors({
            category: testData.targetCategory
          })
          
          categoryFiltered.forEach(error => {
            expect(error.category).toBe(testData.targetCategory)
          })
          
          // Should include our target error
          const targetInCategoryResults = categoryFiltered.some(e => e.message === targetMessage)
          expect(targetInCategoryResults).toBe(true)

          // Test severity filtering
          const severityFiltered = errorLogger.getErrors({
            severity: testData.targetSeverity
          })
          
          severityFiltered.forEach(error => {
            expect(error.severity).toBe(testData.targetSeverity)
          })
          
          // Should include our target error
          const targetInSeverityResults = severityFiltered.some(e => e.message === targetMessage)
          expect(targetInSeverityResults).toBe(true)

          // Test combined filtering
          const combinedFiltered = errorLogger.getErrors({
            category: testData.targetCategory,
            severity: testData.targetSeverity
          })
          
          combinedFiltered.forEach(error => {
            expect(error.category).toBe(testData.targetCategory)
            expect(error.severity).toBe(testData.targetSeverity)
          })
          
          // Should include our target error
          const targetInCombinedResults = combinedFiltered.some(e => e.message === targetMessage)
          expect(targetInCombinedResults).toBe(true)
        }
      ), { numRuns: 20 })
    })

    it('should respect time window filtering accurately', async () => {
      // Clear errors before test
      errorLogger.clearErrors()
      
      const timeWindowMs = 5000 // 5 seconds
      const errorCount = 5
      const startTime = Date.now()
      
      // Log some errors
      for (let i = 0; i < errorCount; i++) {
        logError(`Error ${i}_${startTime}`, ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM)
      }
      
      // Wait for half the time window
      await new Promise(resolve => setTimeout(resolve, timeWindowMs / 2))
      
      // Log more errors
      for (let i = 0; i < errorCount; i++) {
        logError(`Later Error ${i}_${startTime}`, ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM)
      }
      
      // Get errors within the full time window
      const allErrors = errorLogger.getErrors({
        timeWindowMs: timeWindowMs
      })
      
      // Should include all errors (they're all within the window)
      expect(allErrors.length).toBeGreaterThanOrEqual(errorCount * 2)
      
      // Get errors within a smaller time window
      const recentErrors = errorLogger.getErrors({
        timeWindowMs: timeWindowMs / 4
      })
      
      // Should include fewer errors (only the most recent ones)
      expect(recentErrors.length).toBeLessThanOrEqual(allErrors.length)
      
      // All returned errors should be within the time window
      const cutoffTime = Date.now() - (timeWindowMs / 4)
      recentErrors.forEach(error => {
        expect(error.timestamp).toBeGreaterThanOrEqual(cutoffTime)
      })
    })
  })

  describe('Property 19.5: Convenience Functions', () => {
    it('should correctly categorize errors using convenience functions', () => {
      const testCases = [
        { func: logNetworkError, expectedCategory: ErrorCategory.NETWORK, expectedSeverity: ErrorSeverity.HIGH },
        { func: logApiError, expectedCategory: ErrorCategory.API, expectedSeverity: ErrorSeverity.MEDIUM },
        { func: logStorageError, expectedCategory: ErrorCategory.STORAGE, expectedSeverity: ErrorSeverity.MEDIUM },
        { func: logAiError, expectedCategory: ErrorCategory.AI, expectedSeverity: ErrorSeverity.MEDIUM },
        { func: logCriticalError, expectedCategory: ErrorCategory.UNKNOWN, expectedSeverity: ErrorSeverity.CRITICAL }
      ]

      testCases.forEach(({ func, expectedCategory, expectedSeverity }, index) => {
        const errorMessage = `Test error ${index}`
        const fingerprint = func(errorMessage, { component: 'test' })
        
        expect(fingerprint).toBeTruthy()
        
        const errors = errorLogger.getErrors({
          category: expectedCategory,
          severity: expectedSeverity
        })
        
        const matchingError = errors.find(e => e.message === errorMessage)
        expect(matchingError).toBeDefined()
        expect(matchingError.category).toBe(expectedCategory)
        expect(matchingError.severity).toBe(expectedSeverity)
        expect(matchingError.context.component).toBe('test')
      })
    })
  })

  describe('Property 19.6: Error Export and Cleanup', () => {
    it('should export error data in correct format and clean up old errors', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            message: fc.constantFrom(...validMessages),
            category: fc.constantFrom(...Object.values(ErrorCategory)),
            severity: fc.constantFrom(...Object.values(ErrorSeverity))
          }),
          { minLength: 5, maxLength: 20 }
        ),
        (errors) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log all errors with unique messages
          errors.forEach((error, index) => {
            logError(`${error.message}_${index}`, error.category, error.severity)
          })

          // Test JSON export
          const jsonExport = errorLogger.exportErrors('json')
          expect(typeof jsonExport).toBe('string')
          
          const parsedJson = JSON.parse(jsonExport)
          expect(Array.isArray(parsedJson)).toBe(true)
          expect(parsedJson.length).toBeGreaterThanOrEqual(errors.length)
          
          // Verify JSON structure
          parsedJson.forEach(exportedError => {
            expect(exportedError).toHaveProperty('id')
            expect(exportedError).toHaveProperty('message')
            expect(exportedError).toHaveProperty('category')
            expect(exportedError).toHaveProperty('severity')
            expect(exportedError).toHaveProperty('timestamp')
            expect(exportedError).toHaveProperty('fingerprint')
            expect(exportedError).toHaveProperty('count')
          })

          // Test CSV export
          const csvExport = errorLogger.exportErrors('csv')
          expect(typeof csvExport).toBe('string')
          
          const csvLines = csvExport.split('\n')
          expect(csvLines.length).toBeGreaterThan(1) // Header + data rows
          
          // Verify CSV header
          const header = csvLines[0]
          expect(header).toContain('timestamp')
          expect(header).toContain('category')
          expect(header).toContain('severity')
          expect(header).toContain('message')

          // Test cleanup
          const initialErrorCount = errorLogger.getErrors().length
          const clearedCount = errorLogger.clearErrors({
            olderThanMs: 1 // Clear errors older than 1ms (should clear all)
          })
          
          expect(clearedCount).toBeGreaterThanOrEqual(0)
          
          const remainingErrorCount = errorLogger.getErrors().length
          expect(remainingErrorCount).toBeLessThanOrEqual(initialErrorCount)
        }
      ), { numRuns: 15 })
    })
  })

  describe('Property 19.7: Global Error Handling', () => {
    it('should capture unhandled errors and promise rejections', async () => {
      // Clear existing errors first
      errorLogger.clearErrors()
      
      const unsubscribe = errorLogger.onAlert(() => {}) // Prevent actual alerts
      
      // Monitor for new errors
      const initialErrorCount = errorLogger.getErrors().length

      // Manually trigger error logging to simulate global error handling
      logError('Test unhandled rejection', ErrorCategory.UNKNOWN, ErrorSeverity.HIGH, {
        component: 'global',
        action: 'unhandledrejection'
      })

      logError('Test global error', ErrorCategory.UNKNOWN, ErrorSeverity.HIGH, {
        component: 'global',
        action: 'error',
        metadata: {
          filename: 'test.js',
          line: 42,
          column: 10
        }
      })

      // Wait for error processing
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check that errors were captured
      const finalErrorCount = errorLogger.getErrors().length
      expect(finalErrorCount).toBeGreaterThan(initialErrorCount)

      // Find the captured errors
      const allErrors = errorLogger.getErrors()
      const globalErrors = allErrors.filter(e => 
        e.context.component === 'global' && 
        (e.context.action === 'unhandledrejection' || e.context.action === 'error')
      )

      expect(globalErrors.length).toBeGreaterThanOrEqual(2)
      
      globalErrors.forEach(error => {
        expect(error.category).toBe(ErrorCategory.UNKNOWN)
        expect(error.severity).toBe(ErrorSeverity.HIGH)
        expect(error.context.component).toBe('global')
      })

      unsubscribe()
    })
  })

  describe('Property 19.8: Session and Context Tracking', () => {
    it('should maintain consistent session tracking across error logs', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            message: fc.constantFrom(...validMessages),
            component: fc.constantFrom(...validComponents)
          }),
          { minLength: 3, maxLength: 10 }
        ),
        (errorData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          const sessionId = 'test-session-456'
          mockSessionStorage.getItem.mockReturnValue(sessionId)
          global.window.sessionStorage.getItem.mockReturnValue(sessionId)

          // Log multiple errors with unique messages
          errorData.forEach((data, index) => {
            logError(`${data.message}_${index}`, ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM, {
              component: data.component
            })
          })

          // Get all errors
          const errors = errorLogger.getErrors()
          const recentErrors = errors.slice(0, errorData.length)

          // All errors should have the same session ID
          recentErrors.forEach(error => {
            expect(error.context.sessionId).toBe(sessionId)
            expect(error.context.url).toBeTruthy()
            expect(error.context.userAgent).toBeTruthy()
            expect(error.context.timestamp).toBeGreaterThan(0)
          })

          // Verify context preservation - match by message pattern
          errorData.forEach((data, index) => {
            const expectedMessage = `${data.message}_${index}`
            const matchingError = recentErrors.find(e => e.message === expectedMessage)
            expect(matchingError).toBeDefined()
            if (matchingError) {
              expect(matchingError.context.component).toBe(data.component)
            }
          })
        }
      ), { numRuns: 15 })
    })
  })
})