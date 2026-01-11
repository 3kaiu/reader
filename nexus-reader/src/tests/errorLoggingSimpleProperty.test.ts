/**
 * 错误日志和告警系统简化属性测试
 * **Feature: free-tier-maximization, Property 19: 错误日志和告警**
 * 验证错误日志记录、分类、聚合和自动告警机制的核心正确性属性
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
      getItem: vi.fn().mockReturnValue('test-session-123'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
  },
  writable: true
})

// Mock sessionStorage separately for compatibility
const mockSessionStorage = {
  getItem: vi.fn().mockReturnValue('test-session-123'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true
})

describe('Error Logging and Alerting Properties - Simplified', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock fetch to simulate successful external logging
    global.fetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    
    // Clear any existing errors
    errorLogger.clearErrors()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Property 19.1: Error Storage and Retrieval', () => {
    it('should store and retrieve any logged error', () => {
      fc.assert(fc.property(
        fc.record({
          message: fc.string({ minLength: 1, maxLength: 100 }),
          category: fc.constantFrom(...Object.values(ErrorCategory)),
          severity: fc.constantFrom(...Object.values(ErrorSeverity))
        }),
        (errorData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log the error
          const fingerprint = logError(errorData.message, errorData.category, errorData.severity)
          
          // Verify error was stored and can be retrieved
          expect(fingerprint).toBeTruthy()
          
          const allErrors = errorLogger.getErrors()
          expect(allErrors.length).toBeGreaterThan(0)
          
          // Find our specific error
          const storedError = allErrors.find(e => e.fingerprint === fingerprint)
          expect(storedError).toBeDefined()
          
          if (storedError) {
            expect(storedError.message).toBe(errorData.message)
            expect(storedError.category).toBe(errorData.category)
            expect(storedError.severity).toBe(errorData.severity)
            expect(storedError.count).toBe(1)
          }
        }
      ), { numRuns: 20 })
    })

    it('should increment count for duplicate errors', () => {
      fc.assert(fc.property(
        fc.record({
          message: fc.string({ minLength: 1, maxLength: 50 }),
          category: fc.constantFrom(...Object.values(ErrorCategory)),
          repeatCount: fc.integer({ min: 2, max: 5 })
        }),
        (testData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          const fingerprints = []
          
          // Log the same error multiple times
          for (let i = 0; i < testData.repeatCount; i++) {
            const fingerprint = logError(testData.message, testData.category, ErrorSeverity.MEDIUM)
            fingerprints.push(fingerprint)
          }

          // All fingerprints should be identical (same error)
          const uniqueFingerprints = new Set(fingerprints)
          expect(uniqueFingerprints.size).toBe(1)

          // Get the error and verify count
          const allErrors = errorLogger.getErrors()
          const duplicatedError = allErrors.find(e => e.message === testData.message)
          
          expect(duplicatedError).toBeDefined()
          if (duplicatedError) {
            expect(duplicatedError.count).toBe(testData.repeatCount)
          }
        }
      ), { numRuns: 15 })
    })
  })

  describe('Property 19.2: Error Metrics Consistency', () => {
    it('should provide consistent metrics for the same data', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 30 }),
            category: fc.constantFrom(...Object.values(ErrorCategory))
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (errors) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log all errors
          errors.forEach((error, index) => {
            logError(`${error.message}_${index}`, error.category, ErrorSeverity.MEDIUM)
          })

          const timeWindow = 60000 // 1分钟
          
          // Get metrics multiple times
          const metrics1 = errorLogger.getMetrics(timeWindow)
          const metrics2 = errorLogger.getMetrics(timeWindow)

          // Metrics should be consistent
          expect(metrics1.errorCount).toBe(metrics2.errorCount)
          expect(metrics1.errorRate).toBe(metrics2.errorRate)
          expect(metrics1.topErrors.length).toBe(metrics2.topErrors.length)
        }
      ), { numRuns: 10 })
    })
  })

  describe('Property 19.3: Alert System Functionality', () => {
    it('should trigger alerts when conditions are met', async () => {
      // Clear errors and create a simple test rule
      errorLogger.clearErrors()
      
      const testRule = {
        id: 'test_critical_rule',
        name: '测试关键错误规则',
        condition: (metrics, errors) => errors.some(e => e.severity === ErrorSeverity.CRITICAL),
        severity: ErrorSeverity.HIGH,
        cooldownMs: 100, // Short cooldown for testing
        enabled: true
      }

      errorLogger.addAlertRule(testRule)

      let alertTriggered = false
      const unsubscribe = errorLogger.onAlert((alert) => {
        alertTriggered = true
        expect(alert.ruleId).toBe(testRule.id)
        expect(alert.ruleName).toBe(testRule.name)
      })

      try {
        // Log a critical error (should trigger alert)
        logCriticalError('Test critical error for alert')
        
        // Wait for alert processing
        await new Promise(resolve => setTimeout(resolve, 150))
        
        expect(alertTriggered).toBe(true)

      } finally {
        unsubscribe()
        errorLogger.removeAlertRule(testRule.id)
      }
    })
  })

  describe('Property 19.4: Error Filtering', () => {
    it('should correctly filter errors by category', () => {
      fc.assert(fc.property(
        fc.constantFrom(...Object.values(ErrorCategory)),
        (targetCategory) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log errors of different categories
          logError('Network error', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
          logError('API error', ErrorCategory.API, ErrorSeverity.MEDIUM)
          logError('Storage error', ErrorCategory.STORAGE, ErrorSeverity.LOW)
          logError('Target error', targetCategory, ErrorSeverity.MEDIUM)

          // Filter by target category
          const filteredErrors = errorLogger.getErrors({ category: targetCategory })
          
          // All returned errors should match the target category
          filteredErrors.forEach(error => {
            expect(error.category).toBe(targetCategory)
          })
          
          // Should include at least our target error
          expect(filteredErrors.length).toBeGreaterThan(0)
        }
      ), { numRuns: 8 })
    })

    it('should correctly filter errors by severity', () => {
      fc.assert(fc.property(
        fc.constantFrom(...Object.values(ErrorSeverity)),
        (targetSeverity) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log errors of different severities
          logError('High error', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
          logError('Medium error', ErrorCategory.API, ErrorSeverity.MEDIUM)
          logError('Low error', ErrorCategory.STORAGE, ErrorSeverity.LOW)
          logError('Critical error', ErrorCategory.UNKNOWN, ErrorSeverity.CRITICAL)
          logError('Target error', ErrorCategory.UNKNOWN, targetSeverity)

          // Filter by target severity
          const filteredErrors = errorLogger.getErrors({ severity: targetSeverity })
          
          // All returned errors should match the target severity
          filteredErrors.forEach(error => {
            expect(error.severity).toBe(targetSeverity)
          })
          
          // Should include at least our target error
          expect(filteredErrors.length).toBeGreaterThan(0)
        }
      ), { numRuns: 4 })
    })
  })

  describe('Property 19.5: Convenience Functions', () => {
    it('should correctly categorize errors using convenience functions', () => {
      // Clear errors before test
      errorLogger.clearErrors()
      
      const testCases = [
        { func: logNetworkError, expectedCategory: ErrorCategory.NETWORK, expectedSeverity: ErrorSeverity.HIGH },
        { func: logApiError, expectedCategory: ErrorCategory.API, expectedSeverity: ErrorSeverity.MEDIUM },
        { func: logStorageError, expectedCategory: ErrorCategory.STORAGE, expectedSeverity: ErrorSeverity.MEDIUM },
        { func: logAiError, expectedCategory: ErrorCategory.AI, expectedSeverity: ErrorSeverity.MEDIUM },
        { func: logCriticalError, expectedCategory: ErrorCategory.UNKNOWN, expectedSeverity: ErrorSeverity.CRITICAL }
      ]

      testCases.forEach(({ func, expectedCategory, expectedSeverity }, index) => {
        const errorMessage = `Test error ${index}`
        const fingerprint = func(errorMessage)
        
        expect(fingerprint).toBeTruthy()
        
        const errors = errorLogger.getErrors({
          category: expectedCategory,
          severity: expectedSeverity
        })
        
        const matchingError = errors.find(e => e.message === errorMessage)
        expect(matchingError).toBeDefined()
        
        if (matchingError) {
          expect(matchingError.category).toBe(expectedCategory)
          expect(matchingError.severity).toBe(expectedSeverity)
        }
      })
    })
  })

  describe('Property 19.6: Data Export and Cleanup', () => {
    it('should export error data in valid format', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 50 }),
            category: fc.constantFrom(...Object.values(ErrorCategory))
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (errors) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          // Log all errors
          errors.forEach((error, index) => {
            logError(`${error.message}_${index}`, error.category, ErrorSeverity.MEDIUM)
          })

          // Test JSON export
          const jsonExport = errorLogger.exportErrors('json')
          expect(typeof jsonExport).toBe('string')
          
          const parsedJson = JSON.parse(jsonExport)
          expect(Array.isArray(parsedJson)).toBe(true)
          expect(parsedJson.length).toBeGreaterThanOrEqual(errors.length)

          // Test CSV export
          const csvExport = errorLogger.exportErrors('csv')
          expect(typeof csvExport).toBe('string')
          expect(csvExport).toContain('timestamp')
          expect(csvExport).toContain('category')
          expect(csvExport).toContain('severity')
        }
      ), { numRuns: 5 })
    })

    it('should clear errors when requested', () => {
      // Clear errors before test
      errorLogger.clearErrors()
      
      // Log some errors
      logError('Error 1', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
      logError('Error 2', ErrorCategory.API, ErrorSeverity.MEDIUM)
      
      const initialCount = errorLogger.getErrors().length
      expect(initialCount).toBeGreaterThan(0)
      
      // Clear all errors
      const clearedCount = errorLogger.clearErrors()
      expect(clearedCount).toBe(initialCount)
      
      const finalCount = errorLogger.getErrors().length
      expect(finalCount).toBe(0)
    })
  })

  describe('Property 19.7: Session Tracking', () => {
    it('should maintain consistent session tracking', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 30 }),
            component: fc.string({ minLength: 1, maxLength: 20 })
          }),
          { minLength: 1, maxLength: 3 }
        ),
        (errorData) => {
          // Clear errors before each property test iteration
          errorLogger.clearErrors()
          
          const sessionId = 'test-session-456'
          mockSessionStorage.getItem.mockReturnValue(sessionId)
          global.window.sessionStorage.getItem.mockReturnValue(sessionId)

          // Log multiple errors
          errorData.forEach((data, index) => {
            logError(`${data.message}_${index}`, ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM, {
              component: data.component
            })
          })

          // Get all errors
          const errors = errorLogger.getErrors()
          expect(errors.length).toBeGreaterThanOrEqual(errorData.length)

          // All errors should have the same session ID
          errors.slice(0, errorData.length).forEach(error => {
            expect(error.context.sessionId).toBe(sessionId)
            expect(error.context.url).toBeTruthy()
            expect(error.context.timestamp).toBeGreaterThan(0)
          })
        }
      ), { numRuns: 5 })
    })
  })
})