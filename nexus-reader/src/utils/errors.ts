/**
 * Unified Error Handling System for Nexus Reader
 * Implements standardized error codes and responses compatible with Nexus ecosystem
 */
import {
  getLocalStorageItem,
  getSessionStorageItem,
} from '@/utils/browserStorage'
import { logger } from '@/utils/logger'

export enum ErrorCode {
  // Network Layer (1000-1999)
  NETWORK_ERROR = 1000,
  TIMEOUT = 1001,
  DNS_RESOLUTION_FAILED = 1002,
  CONNECTION_REFUSED = 1003,
  TLS_HANDSHAKE_FAILED = 1004,

  // Anti-Crawl Layer (2000-2999)
  CLOUDFLARE_CHALLENGE = 2000,
  CLOUDFLARE_CHALLENGE_FAILED = 2001,
  RATE_LIMITED = 2002,
  IP_BANNED = 2003,
  ALL_STRATEGIES_FAILED = 2004,
  CIRCUIT_OPEN = 2005,
  STRATEGY_DISABLED = 2006,

  // Parse Layer (3000-3999)
  HTML_PARSE_ERROR = 3000,
  RULE_MISMATCH = 3001,
  JSON_PARSE_ERROR = 3002,
  INVALID_SELECTOR = 3003,
  CONTENT_EXTRACTION_FAILED = 3004,

  // Storage Layer (5000-5999)
  SOURCE_NOT_FOUND = 5000,
  DATABASE_ERROR = 5001,
  FILE_IO_ERROR = 5002,
  CACHE_MISS = 5003,
  STORAGE_QUOTA_EXCEEDED = 5004,

  // Authentication Layer (7000-7999)
  UNAUTHORIZED = 7000,
  FORBIDDEN = 7001,
  INVALID_TOKEN = 7002,
  TOKEN_EXPIRED = 7003,
  INSUFFICIENT_PERMISSIONS = 7004,

  // Configuration Layer (8000-8999)
  INVALID_CONFIG = 8000,
  CONFIG_NOT_FOUND = 8001,
  CONFIG_VALIDATION_FAILED = 8002,

  // AI/ML Layer (9000-9999)
  MODEL_LOAD_FAILED = 9000,
  INFERENCE_FAILED = 9001,
  UNSUPPORTED_MODEL_TYPE = 9002,
  MODEL_TIMEOUT = 9003,
  INSUFFICIENT_RESOURCES = 9004,

  // UI/UX Layer (11000-11999)
  UI_RENDER_ERROR = 11000,
  COMPONENT_LOAD_FAILED = 11001,
  VIRTUAL_SCROLL_ERROR = 11002,
  PERFORMANCE_DEGRADATION = 11003,

  // Generic (0000-0999)
  INTERNAL_ERROR = 0,
  UNKNOWN_ERROR = 1,
  VALIDATION_ERROR = 2,
  SERIALIZATION_ERROR = 3,
  DESERIALIZATION_ERROR = 4,
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  [key: string]: any
  url?: string
  userId?: string
  sessionId?: string
  component?: string
  action?: string
  timestamp?: number
}

export interface ErrorResponse {
  code: ErrorCode
  severity: ErrorSeverity
  message: string
  details?: string
  timestamp: number
  requestId?: string
  context?: ErrorContext
}

export class NexusError extends Error {
  public readonly code: ErrorCode
  public readonly severity: ErrorSeverity
  public readonly details?: string
  public readonly context?: ErrorContext
  public readonly timestamp: number
  public readonly requestId?: string

  constructor(
    code: ErrorCode,
    message: string,
    details?: string,
    context?: ErrorContext,
    requestId?: string
  ) {
    super(message)
    this.name = 'NexusError'
    this.code = code
    this.details = details
    this.context = context
    this.timestamp = Date.now()
    this.requestId = requestId

    // Auto-determine severity based on error code
    this.severity = this.getSeverity()
  }

  private getSeverity(): ErrorSeverity {
    const criticalCodes = [
      ErrorCode.CIRCUIT_OPEN,
      ErrorCode.ALL_STRATEGIES_FAILED,
      ErrorCode.STORAGE_QUOTA_EXCEEDED,
      ErrorCode.INTERNAL_ERROR,
    ]

    const highCodes = [
      ErrorCode.IP_BANNED,
      ErrorCode.CLOUDFLARE_CHALLENGE_FAILED,
      ErrorCode.INSUFFICIENT_RESOURCES,
      ErrorCode.UNAUTHORIZED,
      ErrorCode.FORBIDDEN,
      ErrorCode.DATABASE_ERROR,
      ErrorCode.FILE_IO_ERROR,
      ErrorCode.UI_RENDER_ERROR,
    ]

    const mediumCodes = [
      ErrorCode.TIMEOUT,
      ErrorCode.CONNECTION_REFUSED,
      ErrorCode.TLS_HANDSHAKE_FAILED,
      ErrorCode.CLOUDFLARE_CHALLENGE,
      ErrorCode.RATE_LIMITED,
      ErrorCode.INVALID_CONFIG,
      ErrorCode.CONFIG_VALIDATION_FAILED,
      ErrorCode.MODEL_TIMEOUT,
      ErrorCode.PERFORMANCE_DEGRADATION,
    ]

    if (criticalCodes.includes(this.code)) {
      return ErrorSeverity.CRITICAL
    } else if (highCodes.includes(this.code)) {
      return ErrorSeverity.HIGH
    } else if (mediumCodes.includes(this.code)) {
      return ErrorSeverity.MEDIUM
    } else {
      return ErrorSeverity.LOW
    }
  }

  get isRetryable(): boolean {
    const retryableCodes = [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.RATE_LIMITED,
      ErrorCode.CLOUDFLARE_CHALLENGE,
      ErrorCode.CONNECTION_REFUSED,
      ErrorCode.TLS_HANDSHAKE_FAILED,
      ErrorCode.MODEL_TIMEOUT,
    ]
    return retryableCodes.includes(this.code)
  }

  get retryDelay(): number | null {
    switch (this.code) {
      case ErrorCode.RATE_LIMITED:
        return this.context?.retryAfter || 60
      case ErrorCode.TIMEOUT:
        return 1
      case ErrorCode.CLOUDFLARE_CHALLENGE:
        return 5
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.CONNECTION_REFUSED:
        return 2
      case ErrorCode.TLS_HANDSHAKE_FAILED:
        return 3
      case ErrorCode.MODEL_TIMEOUT:
        return 3
      default:
        return null
    }
  }

  toErrorResponse(): ErrorResponse {
    return {
      code: this.code,
      severity: this.severity,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      context: this.context
    }
  }

  static fromNetworkError(error: any, url?: string): NexusError {
    if (error.name === 'AbortError') {
      return new NexusError(
        ErrorCode.TIMEOUT,
        'Request timeout',
        undefined,
        { url, originalError: error.message }
      )
    } else if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
      return new NexusError(
        ErrorCode.NETWORK_ERROR,
        'Network request failed',
        error.message,
        { url, originalError: error.message, level: 'user' as any }
      )
    } else {
      return new NexusError(
        ErrorCode.NETWORK_ERROR,
        error.message || 'Unknown network error',
        undefined,
        { url, originalError: error.message, level: 'user' as any }
      )
    }
  }

  static fromValidationError(field: string, message: string): NexusError {
    return new NexusError(
      ErrorCode.VALIDATION_ERROR,
      `Validation failed for ${field}: ${message}`,
      undefined,
      { field }
    )
  }

  static fromAIError(error: any, modelId?: string): NexusError {
    return new NexusError(
      ErrorCode.INFERENCE_FAILED,
      'AI inference failed',
      error.message,
      { modelId, originalError: error.message }
    )
  }
}

// Error handling utilities
export function isNexusError(error: any): error is NexusError {
  return error instanceof NexusError
}

export function createErrorBoundary() {
  return {
    error: null as NexusError | null,

    capture(error: any, context?: ErrorContext): NexusError {
      if (isNexusError(error)) {
        this.error = error
        return error
      }

      // Convert unknown errors
      const nexusError = new NexusError(
        ErrorCode.INTERNAL_ERROR,
        error.message || 'An unexpected error occurred',
        error.stack,
        {
          ...context,
          originalError: error.toString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }
      )

      this.error = nexusError
      return nexusError
    },

    clear() {
      this.error = null
    },

    getLastError() {
      return this.error
    }
  }
}

// Global error boundary instance
export const globalErrorBoundary = createErrorBoundary()

// Error reporting function
export function reportError(error: NexusError, additionalContext?: ErrorContext) {
  const errorReport = {
    ...error.toErrorResponse(),
    context: {
      ...error.context,
      ...additionalContext,
      userId: getLocalStorageItem('user_id'),
      sessionId: getSessionStorageItem('session_id'),
    }
  }

  // Log in development
  if (import.meta.env.DEV) {
    logger.error('Nexus error', errorReport)
  }

  // TODO: Send to error reporting service
  // sendToErrorReporting(errorReport)

  // Store in global error boundary
  globalErrorBoundary.capture(error, additionalContext)
}

// Async error handler decorator
export function errorHandler(_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    try {
      return await originalMethod.apply(this, args)
    } catch (error: any) {
      if (isNexusError(error)) {
        throw error
      }

      // Convert to NexusError
      const nexusError = new NexusError(
        ErrorCode.INTERNAL_ERROR,
        `Error in ${propertyKey}: ${error.message}`,
        error.stack,
        {
          method: propertyKey,
          args: args.map(arg => typeof arg === 'object' ? '[Object]' : String(arg)),
          originalError: error.toString()
        }
      )

      reportError(nexusError)
      throw nexusError
    }
  }

  return descriptor
}

// Structured error info used by retry helpers and property tests
export interface ErrorInfo {
  message: string
  code: string
  severity: ErrorSeverity
  userMessage: string
  retryable: boolean
  context?: any
}

const KNOWN_ERROR_PRESETS = [
  {
    match: (message: string, error: any) =>
      error?.status === 401 || message.toLowerCase().includes('unauthorized'),
    code: 'UNAUTHORIZED',
    severity: ErrorSeverity.HIGH,
    userMessage: '登录已过期，请重新登录',
    retryable: false,
  },
  {
    match: (message: string, error: any) =>
      error?.status === 403 || message.toLowerCase().includes('forbidden'),
    code: 'FORBIDDEN',
    severity: ErrorSeverity.HIGH,
    userMessage: '没有权限执行此操作',
    retryable: false,
  },
  {
    match: (message: string) => {
      const normalized = message.toLowerCase()
      return (
        normalized.includes('networkerror') ||
        normalized.includes('network error') ||
        normalized.includes('failed to fetch') ||
        normalized.includes('network request failed') ||
        normalized.includes('fetch failed')
      )
    },
    code: 'NETWORK_ERROR',
    severity: ErrorSeverity.MEDIUM,
    userMessage: '网络连接失败，请检查网络设置',
    retryable: true,
  },
  {
    match: (message: string, error: any) => {
      const normalized = message.toLowerCase()
      return (
        error?.name === 'AbortError' ||
        normalized.includes('timeouterror') ||
        normalized.includes('timeout error') ||
        normalized.includes('timed out') ||
        normalized.includes('timeout')
      )
    },
    code: 'TIMEOUT',
    severity: ErrorSeverity.MEDIUM,
    userMessage: '请求超时，请稍后重试',
    retryable: true,
  },
  {
    match: (message: string) => message.toLowerCase().includes('quotaexceedederror'),
    code: 'QUOTA_EXCEEDED',
    severity: ErrorSeverity.HIGH,
    userMessage: '存储空间已满',
    retryable: false,
  },
  {
    match: (message: string) => message.toLowerCase().includes('tocemptyexception'),
    code: 'TOC_EMPTY',
    severity: ErrorSeverity.LOW,
    userMessage: '目录为空',
    retryable: false,
  },
  {
    match: (message: string, error: any) =>
      error instanceof SyntaxError || message.toLowerCase().includes('syntaxerror'),
    code: 'SYNTAX_ERROR',
    severity: ErrorSeverity.LOW,
    userMessage: '数据格式错误，请重试',
    retryable: false,
  },
] as const

function normalizeErrorCode(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return normalized || 'UNKNOWN_ERROR'
}

function cleanErrorMessage(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) {
    return 'Unknown error'
  }

  const withoutJavaPrefix = trimmed.replace(
    /^(?:[\w$.]+(?:Exception|Error)):\s+/,
    ''
  )

  return withoutJavaPrefix.trim() || trimmed
}

function extractErrorMessage(error: any): string {
  if (error instanceof NexusError) {
    return cleanErrorMessage(error.message)
  }

  if (error instanceof Error) {
    return cleanErrorMessage(error.message || error.name || 'Unknown error')
  }

  if (typeof error === 'string') {
    return cleanErrorMessage(error)
  }

  if (error && typeof error === 'object') {
    const candidate = [error.errorMsg, error.message, error.error].find(
      value => typeof value === 'string' && value.trim().length > 0
    )
    if (candidate) {
      return cleanErrorMessage(candidate)
    }
  }

  return cleanErrorMessage(String(error ?? 'Unknown error'))
}

function mapUserMessageByCode(code: string, fallback: string): string {
  const mappedMessages: Record<string, string> = {
    NETWORK_ERROR: '网络连接失败，请检查网络设置',
    TIMEOUT: '请求超时，请稍后重试',
    UNAUTHORIZED: '登录已过期，请重新登录',
    FORBIDDEN: '没有权限执行此操作',
    QUOTA_EXCEEDED: '存储空间已满',
    TOC_EMPTY: '目录为空',
    SYNTAX_ERROR: '数据格式错误，请重试',
  }

  return mappedMessages[code] || fallback || '操作失败，请重试'
}

function resolveErrorPreset(message: string, error: any) {
  return KNOWN_ERROR_PRESETS.find(preset => preset.match(message, error))
}

function logProcessedError(errorInfo: ErrorInfo, error: any, context?: any) {
  const logMethod =
    errorInfo.severity === ErrorSeverity.CRITICAL || errorInfo.severity === ErrorSeverity.HIGH
      ? 'error'
      : errorInfo.severity === ErrorSeverity.MEDIUM
        ? 'warn'
        : 'info'

  ;(logger as any)[logMethod](
    'Processed error',
    {
      rawError: error,
      code: errorInfo.code,
      message: errorInfo.message,
      retryable: errorInfo.retryable,
      severity: errorInfo.severity,
    },
    context
  )
}

/**
 * Process any error into a standardized ErrorInfo object
 */
export function processError(error: any, context?: any): ErrorInfo {
  const message = extractErrorMessage(error)
  let errorInfo: ErrorInfo

  if (error instanceof NexusError) {
    const code = ErrorCode[error.code] || String(error.code)
    errorInfo = {
      message,
      code,
      severity: error.severity,
      userMessage: mapUserMessageByCode(code, message),
      retryable: error.isRetryable,
      context,
    }
  } else {
    const preset = resolveErrorPreset(message, error)
    const code =
      preset?.code ||
      normalizeErrorCode(
        error instanceof Error && error.name && error.name !== 'Error' ? error.name : message
      )
    const severity = preset?.severity || ErrorSeverity.LOW

    errorInfo = {
      message,
      code,
      severity,
      userMessage: preset?.userMessage || mapUserMessageByCode(code, '操作失败，请重试'),
      retryable: preset?.retryable || false,
      context,
    }
  }

  logProcessedError(errorInfo, error, context)

  return {
    ...errorInfo,
    context
  }
}

/**
 * Retry utility for async operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: 'linear' | 'exponential'
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 'exponential' } = options
  let lastError: any

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const info = processError(error)
      
      if (!info.retryable || attempt === maxAttempts) {
        throw error
      }

      const waitTime = backoff === 'exponential' 
        ? delay * Math.pow(2, attempt - 1)
        : delay * attempt
        
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw lastError
}

// Synchronous error handler
export function syncErrorHandler(_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value

  descriptor.value = function (...args: any[]) {
    try {
      return originalMethod.apply(this, args)
    } catch (error: any) {
      if (isNexusError(error)) {
        throw error
      }

      // Convert to NexusError
      const nexusError = new NexusError(
        ErrorCode.INTERNAL_ERROR,
        `Error in ${propertyKey}: ${error.message}`,
        error.stack,
        {
          method: propertyKey,
          args: args.map(arg => typeof arg === 'object' ? '[Object]' : String(arg)),
          originalError: error.toString()
        }
      )

      reportError(nexusError)
      throw nexusError
    }
  }

  return descriptor
}
