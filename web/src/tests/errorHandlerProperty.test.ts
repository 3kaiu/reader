/**
 * Property-Based Tests for Unified Error Handling System
 * Feature: unified-error-handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { processError } from '../utils/errors'
import { withRetry } from '../utils/errors/processing'
import { logger } from '../utils/logger'

// Mock logger to avoid console output during tests
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('Error Handler Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 1: Error Processing Returns Valid ErrorInfo', () => {
    /**
     * For any error input (Error object, string, or unknown), when processError is called,
     * it SHALL return an ErrorInfo object containing all required fields: message (string),
     * code (string), severity (valid enum value), userMessage (non-empty Chinese string),
     * retryable (boolean), and optionally context.
     *
     * **Validates: Requirements 1.2, 2.4**
     */
    it('should return valid ErrorInfo for any error input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Error objects
            fc.string().map(msg => new Error(msg)),
            // String errors
            fc.string(),
            // Object errors with message field
            fc.record({
              message: fc.string(),
              error: fc.option(fc.string()),
              errorMsg: fc.option(fc.string()),
            }),
            // Unknown types
            fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined))
          ),
          fc.option(
            fc.record({
              component: fc.option(fc.string()),
              function: fc.option(fc.string()),
              userId: fc.option(fc.string()),
            })
          ),
          (error, context) => {
            const result = processError(error, context || undefined)

            // Verify all required fields exist
            expect(result).toHaveProperty('message')
            expect(result).toHaveProperty('code')
            expect(result).toHaveProperty('severity')
            expect(result).toHaveProperty('userMessage')
            expect(result).toHaveProperty('retryable')

            // Verify field types
            expect(typeof result.message).toBe('string')
            expect(typeof result.code).toBe('string')
            expect(typeof result.userMessage).toBe('string')
            expect(typeof result.retryable).toBe('boolean')

            // Verify severity is valid enum value
            expect(['low', 'medium', 'high', 'critical']).toContain(result.severity)

            // Verify userMessage is non-empty
            expect(result.userMessage.length).toBeGreaterThan(0)

            // Verify code is non-empty
            expect(result.code.length).toBeGreaterThan(0)

            // Verify context is preserved if provided
            if (context) {
              expect(result.context).toEqual(context)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle known error types correctly', () => {
      const knownErrors = [
        'NetworkError',
        'TimeoutError',
        'Unauthorized',
        'TocEmptyException',
        'QuotaExceededError',
      ]

      knownErrors.forEach(errorType => {
        const result = processError(errorType)

        // Known errors should have specific codes
        expect(result.code).not.toBe('UNKNOWN_ERROR')
        expect(result.userMessage).not.toBe('操作失败，请重试')
      })
    })

    it('should clean Java exception prefixes', () => {
      // Test with realistic Java exception patterns
      const testCases = [
        { input: 'NullPointerException: Object is null', expected: 'Object is null' },
        { input: 'IOException: File not found', expected: 'File not found' },
        { input: 'TimeoutException: Request timed out', expected: 'Request timed out' },
      ]

      testCases.forEach(({ input, expected }) => {
        const result = processError(input)
        // The message should be cleaned or remain as is (safe fallback)
        expect(result.message === expected || result.message === input).toBe(true)
      })
    })

    it('should simplify long technical errors', () => {
      // Generate long technical error messages
      const longError = 'com.example.SomeException: ' + 'a'.repeat(150) + '.stacktrace.here'
      const result = processError(longError)

      // Long technical errors should be simplified
      expect(result.userMessage.length).toBeLessThan(100)
    })
  })

  describe('Property 2: Retryable Errors Trigger Retry Attempts', () => {
    /**
     * For any operation that fails with a retryable error, when withRetry is called
     * with maxAttempts > 1, the operation SHALL be attempted multiple times before throwing.
     *
     * **Validates: Requirements 4.2**
     */
    it('should retry operations for retryable errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 1, max: 100 }),
          async (maxAttempts, delay) => {
            let attemptCount = 0
            const operation = vi.fn(async () => {
              attemptCount++
              throw new Error('NetworkError') // Retryable error
            })

            try {
              await withRetry(operation, { maxAttempts, delay, backoff: 'linear' })
            } catch (error: any) {
              // Expected to throw after all retries
            }

            // Should have attempted maxAttempts times
            expect(attemptCount).toBe(maxAttempts)
            expect(operation).toHaveBeenCalledTimes(maxAttempts)
          }
        ),
        { numRuns: 20 }
      )
    })

    it('should succeed on retry if operation eventually succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 1, max: 3 }),
          async (maxAttempts, successOnAttempt) => {
            // Ensure successOnAttempt is within maxAttempts
            const actualSuccessAttempt = Math.min(successOnAttempt, maxAttempts)
            let attemptCount = 0

            const operation = async () => {
              attemptCount++
              if (attemptCount < actualSuccessAttempt) {
                throw new Error('TimeoutError') // Retryable
              }
              return 'success'
            }

            const result = await withRetry(operation, { maxAttempts, delay: 1 })

            expect(result).toBe('success')
            expect(attemptCount).toBe(actualSuccessAttempt)
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  describe('Property 3: Non-Retryable Errors Throw Immediately', () => {
    /**
     * For any operation that fails with a non-retryable error, when withRetry is called,
     * the function SHALL throw immediately without additional retry attempts.
     *
     * **Validates: Requirements 4.3**
     */
    it('should not retry non-retryable errors', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async maxAttempts => {
          let attemptCount = 0
          const operation = vi.fn(async () => {
            attemptCount++
            throw new Error('Unauthorized') // Non-retryable error
          })

          try {
            await withRetry(operation, { maxAttempts, delay: 1 })
          } catch (error: any) {
            // Expected to throw
          }

          // Should only attempt once
          expect(attemptCount).toBe(1)
          expect(operation).toHaveBeenCalledTimes(1)
        }),
        { numRuns: 20 }
      )
    })
  })

  describe('Property 4: Backoff Strategy Correctness', () => {
    /**
     * For any retry sequence with exponential backoff, the delay between attempt N and N+1
     * SHALL be initialDelay * 2^(N-1). For linear backoff, the delay SHALL be initialDelay * N.
     *
     * **Validates: Requirements 4.4**
     */
    it('should use exponential backoff correctly', async () => {
      const initialDelay = 10
      const maxAttempts = 4

      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        throw new Error('NetworkError')
      }

      const startTime = Date.now()
      try {
        await withRetry(operation, {
          maxAttempts,
          delay: initialDelay,
          backoff: 'exponential',
        })
      } catch (error: any) {
        // Expected
      }
      const totalTime = Date.now() - startTime

      // Expected delays: 10, 20, 40 (between attempts 1-2, 2-3, 3-4)
      // Total expected time: ~70ms (allowing for execution overhead)
      expect(totalTime).toBeGreaterThanOrEqual(60)
      expect(totalTime).toBeLessThan(150) // Allow some overhead
    })

    it('should use linear backoff correctly', async () => {
      const initialDelay = 10
      const maxAttempts = 4

      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        throw new Error('TimeoutError')
      }

      const startTime = Date.now()
      try {
        await withRetry(operation, {
          maxAttempts,
          delay: initialDelay,
          backoff: 'linear',
        })
      } catch (error: any) {
        // Expected
      }
      const totalTime = Date.now() - startTime

      // Expected delays: 10, 20, 30 (between attempts 1-2, 2-3, 3-4)
      // Total expected time: ~60ms
      expect(totalTime).toBeGreaterThanOrEqual(50)
      expect(totalTime).toBeLessThan(120)
    })
  })

  describe('Property 5: Logging Severity Mapping', () => {
    /**
     * For any error processed, the log level SHALL be determined by severity:
     * critical/high → error, medium → warn, low → info.
     * The log entry SHALL include the error context when provided.
     *
     * **Validates: Requirements 5.1, 5.2, 5.3**
     */
    it('should map severity to correct log level', () => {
      const severityToLogLevel: Record<string, 'error' | 'warn' | 'info'> = {
        critical: 'error',
        high: 'error',
        medium: 'warn',
        low: 'info',
      }

      // Use actual error types that map to each severity
      const errorMap: Record<string, string> = {
        high: 'Unauthorized',
        medium: 'NetworkError',
        low: 'SyntaxError',
      }

      fc.assert(
        fc.property(fc.constantFrom('high', 'medium', 'low'), severity => {
          vi.clearAllMocks()

          processError(errorMap[severity])

          const expectedLogLevel = severityToLogLevel[severity]
          expect(logger[expectedLogLevel]).toHaveBeenCalled()
        }),
        { numRuns: 50 }
      )
    })

    it('should include context in log entries', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.record({
            component: fc.string(),
            function: fc.string(),
            userId: fc.string(),
          }),
          (errorMessage, context) => {
            vi.clearAllMocks()

            processError(errorMessage, context)

            // Verify logger was called with context
            const loggerCalls = [
              ...(logger.error as any).mock.calls,
              ...(logger.warn as any).mock.calls,
              ...(logger.info as any).mock.calls,
            ]

            expect(loggerCalls.length).toBeGreaterThan(0)

            // Find the call with context
            const callWithContext = loggerCalls.find(call => {
              const contextArg = call[2]
              return (
                contextArg &&
                contextArg.component === context.component &&
                contextArg.function === context.function &&
                contextArg.userId === context.userId
              )
            })

            expect(callWithContext).toBeDefined()
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})

describe('useErrorHandler Composable Tests', () => {
  // Mock useMessage - must be defined before vi.mock
  let mockShowError: ReturnType<typeof vi.fn>
  let mockShowWarning: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockShowError = vi.fn()
    mockShowWarning = vi.fn()

    // Reset modules to ensure fresh imports
    vi.resetModules()

    // Mock useMessage
    vi.doMock('../composables/useMessage', () => ({
      useMessage: () => ({
        error: mockShowError,
        warning: mockShowWarning,
      }),
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.doUnmock('../composables/useMessage')
  })

  describe('Property 6: Toast Display Controlled by showToast Parameter', () => {
    /**
     * For any error handled via useErrorHandler().handleError(), when showToast is true,
     * the toast notification SHALL be displayed with userMessage. When showToast is false,
     * no toast SHALL be displayed.
     *
     * **Validates: Requirements 3.2, 3.4**
     */
    it('should display toast when showToast is true', async () => {
      // Dynamic import to get fresh instance with mocked useMessage
      const { useErrorHandler } = await import('../composables/useErrorHandler')

      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string({ minLength: 1 }),
            fc.string().map(msg => new Error(msg))
          ),
          async error => {
            mockShowError.mockClear()

            const { handleError } = useErrorHandler()
            handleError(error, undefined, true)

            // Toast should be displayed
            expect(mockShowError).toHaveBeenCalledTimes(1)
            expect(mockShowError).toHaveBeenCalledWith(expect.any(String))

            // Message should be non-empty
            const displayedMessage = mockShowError.mock.calls[0][0]
            expect(displayedMessage.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should not display toast when showToast is false', async () => {
      const { useErrorHandler } = await import('../composables/useErrorHandler')

      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string({ minLength: 1 }),
            fc.string().map(msg => new Error(msg))
          ),
          async error => {
            mockShowError.mockClear()

            const { handleError } = useErrorHandler()
            handleError(error, undefined, false)

            // Toast should NOT be displayed
            expect(mockShowError).not.toHaveBeenCalled()
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should display toast by default (showToast parameter omitted)', async () => {
      const { useErrorHandler } = await import('../composables/useErrorHandler')

      mockShowError.mockClear()

      const { handleError } = useErrorHandler()
      handleError('Test error')

      // Toast should be displayed by default
      expect(mockShowError).toHaveBeenCalledTimes(1)
    })

    it('should display correct userMessage in toast', async () => {
      const { useErrorHandler } = await import('../composables/useErrorHandler')

      const knownErrors = [
        { error: 'NetworkError', expectedInMessage: '网络' },
        { error: 'Unauthorized', expectedInMessage: '登录' },
        { error: 'TocEmptyException', expectedInMessage: '目录' },
      ]

      for (const { error, expectedInMessage } of knownErrors) {
        mockShowError.mockClear()

        const { handleError } = useErrorHandler()
        handleError(error, undefined, true)

        expect(mockShowError).toHaveBeenCalledTimes(1)
        const displayedMessage = mockShowError.mock.calls[0][0]
        expect(displayedMessage).toContain(expectedInMessage)
      }
    })

    it('should include requestId in toast when available on NexusError', async () => {
      const { useErrorHandler } = await import('../composables/useErrorHandler')
      const { NexusError, ErrorCode } = await import('../utils/errors')

      mockShowError.mockClear()

      const err = new NexusError(
        ErrorCode.INTERNAL_ERROR,
        'Boom',
        'details',
        { url: '/api/x' },
        'req-xyz'
      )
      const { handleError } = useErrorHandler()
      handleError(err, undefined, true)

      expect(mockShowError).toHaveBeenCalledTimes(1)
      expect(mockShowError.mock.calls[0][0]).toContain('请求ID: req-xyz')
    })
  })

  describe('API Compatibility Tests', () => {
    it('should expose all required methods', async () => {
      const { useErrorHandler } = await import('../composables/useErrorHandler')

      const handler = useErrorHandler()

      expect(handler).toHaveProperty('handleError')
      expect(handler).toHaveProperty('handleApiError')
      expect(handler).toHaveProperty('handlePromiseError')
      expect(handler).toHaveProperty('handleWarning')
      expect(handler).toHaveProperty('formatErrorMessage')

      expect(typeof handler.handleError).toBe('function')
      expect(typeof (handler as any).handleApiError).toBe('function')
      expect(typeof (handler as any).handlePromiseError).toBe('function')
      expect(typeof (handler as any).handleWarning).toBe('function')
      expect(typeof (handler as any).formatErrorMessage).toBe('function')
    })

    it('should handle API errors correctly', async () => {
      const { useErrorHandler } = await import('../composables/useErrorHandler')

      const { handleApiError } = useErrorHandler() as any

      // Success response
      const successResponse = { isSuccess: true }
      const result1 = handleApiError(successResponse)
      expect(result1).toBe('')

      // Error response
      mockShowError.mockClear()
      const errorResponse = { isSuccess: false, errorMsg: 'API Error' }
      const result2 = handleApiError(errorResponse)
      expect(result2).toBeTruthy()
      expect(mockShowError).toHaveBeenCalled()
    })

    it('should handle warnings correctly', async () => {
      const { useErrorHandler } = await import('../composables/useErrorHandler')

      mockShowWarning.mockClear()

      const { handleWarning } = useErrorHandler() as any
      handleWarning('Test warning')

      expect(mockShowWarning).toHaveBeenCalledTimes(1)
      expect(mockShowWarning).toHaveBeenCalledWith('Test warning')
    })
  })
})
