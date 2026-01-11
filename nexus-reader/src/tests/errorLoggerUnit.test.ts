/**
 * 错误日志系统单元测试
 * 用于调试和验证基本功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  errorLogger, 
  ErrorCategory, 
  ErrorSeverity, 
  logError
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

describe('Error Logger Unit Tests', () => {
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

  it('should log a simple error', () => {
    const fingerprint = logError('Test error message', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
    
    expect(fingerprint).toBeTruthy()
    expect(typeof fingerprint).toBe('string')
    
    const errors = errorLogger.getErrors()
    expect(errors.length).toBeGreaterThan(0)
    
    const testError = errors.find(e => e.message === 'Test error message')
    expect(testError).toBeDefined()
    expect(testError?.category).toBe(ErrorCategory.NETWORK)
    expect(testError?.severity).toBe(ErrorSeverity.HIGH)
  })

  it('should deduplicate identical errors', () => {
    const message = 'Duplicate error message'
    
    const fingerprint1 = logError(message, ErrorCategory.API, ErrorSeverity.MEDIUM)
    const fingerprint2 = logError(message, ErrorCategory.API, ErrorSeverity.MEDIUM)
    
    expect(fingerprint1).toBe(fingerprint2)
    
    const errors = errorLogger.getErrors()
    const duplicateErrors = errors.filter(e => e.message === message)
    
    expect(duplicateErrors.length).toBe(1)
    expect(duplicateErrors[0].count).toBe(2)
  })

  it('should calculate metrics correctly', () => {
    // Log some errors
    logError('Error 1', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
    logError('Error 2', ErrorCategory.API, ErrorSeverity.MEDIUM)
    logError('Error 3', ErrorCategory.STORAGE, ErrorSeverity.LOW)
    
    const metrics = errorLogger.getMetrics()
    
    expect(metrics.errorCount).toBe(3)
    expect(metrics.errorRate).toBeGreaterThan(0)
    expect(metrics.topErrors.length).toBeGreaterThan(0)
  })

  it('should filter errors by category', () => {
    logError('Network error', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
    logError('API error', ErrorCategory.API, ErrorSeverity.MEDIUM)
    logError('Storage error', ErrorCategory.STORAGE, ErrorSeverity.LOW)
    
    const networkErrors = errorLogger.getErrors({ category: ErrorCategory.NETWORK })
    expect(networkErrors.length).toBe(1)
    expect(networkErrors[0].category).toBe(ErrorCategory.NETWORK)
    
    const apiErrors = errorLogger.getErrors({ category: ErrorCategory.API })
    expect(apiErrors.length).toBe(1)
    expect(apiErrors[0].category).toBe(ErrorCategory.API)
  })

  it('should filter errors by severity', () => {
    logError('High error', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
    logError('Medium error', ErrorCategory.API, ErrorSeverity.MEDIUM)
    logError('Low error', ErrorCategory.STORAGE, ErrorSeverity.LOW)
    
    const highErrors = errorLogger.getErrors({ severity: ErrorSeverity.HIGH })
    expect(highErrors.length).toBe(1)
    expect(highErrors[0].severity).toBe(ErrorSeverity.HIGH)
    
    const mediumErrors = errorLogger.getErrors({ severity: ErrorSeverity.MEDIUM })
    expect(mediumErrors.length).toBe(1)
    expect(mediumErrors[0].severity).toBe(ErrorSeverity.MEDIUM)
  })

  it('should export errors in JSON format', () => {
    logError('Export test error', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
    
    const jsonExport = errorLogger.exportErrors('json')
    expect(typeof jsonExport).toBe('string')
    
    const parsedData = JSON.parse(jsonExport)
    expect(Array.isArray(parsedData)).toBe(true)
    expect(parsedData.length).toBeGreaterThan(0)
    
    const exportedError = parsedData.find(e => e.message === 'Export test error')
    expect(exportedError).toBeDefined()
  })

  it('should export errors in CSV format', () => {
    logError('CSV test error', ErrorCategory.API, ErrorSeverity.MEDIUM)
    
    const csvExport = errorLogger.exportErrors('csv')
    expect(typeof csvExport).toBe('string')
    expect(csvExport).toContain('timestamp')
    expect(csvExport).toContain('category')
    expect(csvExport).toContain('severity')
    expect(csvExport).toContain('CSV test error')
  })

  it('should clear old errors', () => {
    logError('Error to be cleared', ErrorCategory.NETWORK, ErrorSeverity.HIGH)
    
    const initialCount = errorLogger.getErrors().length
    expect(initialCount).toBeGreaterThan(0)
    
    const clearedCount = errorLogger.clearErrors({ olderThanMs: 1 })
    expect(clearedCount).toBeGreaterThanOrEqual(0)
    
    const finalCount = errorLogger.getErrors().length
    expect(finalCount).toBeLessThanOrEqual(initialCount)
  })
})