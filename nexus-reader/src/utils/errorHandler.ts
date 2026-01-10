/**
 * 统一错误处理系统
 * 提供一致的错误处理、日志记录和用户友好的错误消息
 */
import { logger } from './logger'

export interface ErrorContext {
  component?: string
  function?: string
  userId?: string
  bookId?: string
  chapterIndex?: number
  [key: string]: any
}

export interface ErrorInfo {
  message: string
  code?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  userMessage: string
  retryable: boolean
  context?: ErrorContext
}

// 错误类型映射
const ERROR_MAPPINGS: Record<string, Partial<ErrorInfo>> = {
  // 网络错误
  'NetworkError': {
    code: 'NETWORK_ERROR',
    severity: 'medium',
    userMessage: '网络连接异常，请检查网络后重试',
    retryable: true
  },
  'TimeoutError': {
    code: 'TIMEOUT_ERROR', 
    severity: 'medium',
    userMessage: '请求超时，请稍后重试',
    retryable: true
  },
  'fetch failed': {
    code: 'FETCH_FAILED',
    severity: 'medium',
    userMessage: '网络请求失败，请检查网络连接',
    retryable: true
  },
  
  // API错误
  'Unauthorized': {
    code: 'UNAUTHORIZED',
    severity: 'high',
    userMessage: '登录已过期，请重新登录',
    retryable: false
  },
  'Forbidden': {
    code: 'FORBIDDEN',
    severity: 'high',
    userMessage: '访问被拒绝，请检查权限',
    retryable: false
  },
  'Not Found': {
    code: 'NOT_FOUND',
    severity: 'medium',
    userMessage: '请求的资源不存在',
    retryable: false
  },
  'Internal Server Error': {
    code: 'SERVER_ERROR',
    severity: 'high',
    userMessage: '服务器内部错误，请稍后重试',
    retryable: true
  },
  
  // 书源错误
  '加载目录失败': {
    code: 'CATALOG_LOAD_FAILED',
    severity: 'medium',
    userMessage: '无法加载书籍目录，请尝试换个书源',
    retryable: true
  },
  '加载内容失败': {
    code: 'CONTENT_LOAD_FAILED',
    severity: 'medium',
    userMessage: '章节内容加载失败，请重试或换个书源',
    retryable: true
  },
  '书源返回受限内容': {
    code: 'RESTRICTED_CONTENT',
    severity: 'medium',
    userMessage: '当前书源内容受限，建议换一个书源',
    retryable: false
  },
  
  // 存储错误
  'QuotaExceededError': {
    code: 'STORAGE_QUOTA_EXCEEDED',
    severity: 'medium',
    userMessage: '存储空间不足，请清理缓存后重试',
    retryable: false
  },
  'InvalidStateError': {
    code: 'STORAGE_INVALID_STATE',
    severity: 'medium',
    userMessage: '存储状态异常，请刷新页面重试',
    retryable: true
  },
  
  // 解析错误
  'SyntaxError': {
    code: 'PARSE_ERROR',
    severity: 'low',
    userMessage: '数据解析失败，请重试',
    retryable: true
  },
  'TypeError': {
    code: 'TYPE_ERROR',
    severity: 'medium',
    userMessage: '数据格式错误，请重试',
    retryable: true
  }
}

// 根据错误消息匹配错误类型
function matchErrorType(error: Error | string): Partial<ErrorInfo> | null {
  const message = typeof error === 'string' ? error : error.message
  
  // 精确匹配
  if (ERROR_MAPPINGS[message]) {
    return ERROR_MAPPINGS[message]
  }
  
  // 模糊匹配
  for (const [pattern, info] of Object.entries(ERROR_MAPPINGS)) {
    if (message.includes(pattern)) {
      return info
    }
  }
  
  return null
}

// 处理错误并返回标准化的错误信息
export function processError(
  error: Error | string | unknown,
  context?: ErrorContext
): ErrorInfo {
  let originalMessage: string
  let errorName: string
  
  if (error instanceof Error) {
    originalMessage = error.message
    errorName = error.name
  } else if (typeof error === 'string') {
    originalMessage = error
    errorName = 'UnknownError'
  } else {
    originalMessage = String(error)
    errorName = 'UnknownError'
  }
  
  // 尝试匹配已知错误类型
  const matchedInfo = matchErrorType(originalMessage) || matchErrorType(errorName)
  
  const errorInfo: ErrorInfo = {
    message: originalMessage,
    code: matchedInfo?.code || 'UNKNOWN_ERROR',
    severity: matchedInfo?.severity || 'medium',
    userMessage: matchedInfo?.userMessage || '操作失败，请重试',
    retryable: matchedInfo?.retryable ?? true,
    context
  }
  
  // 记录错误日志
  const logLevel = errorInfo.severity === 'critical' ? 'error' : 
                   errorInfo.severity === 'high' ? 'error' :
                   errorInfo.severity === 'medium' ? 'warn' : 'info'
  
  logger[logLevel](`[${errorInfo.code}] ${originalMessage}`, error as Error, {
    ...context,
    severity: errorInfo.severity,
    userMessage: errorInfo.userMessage,
    retryable: errorInfo.retryable
  })
  
  return errorInfo
}

// 创建错误处理器类
export class ErrorHandler {
  private context: ErrorContext
  
  constructor(context: ErrorContext = {}) {
    this.context = context
  }
  
  // 处理错误
  handle(error: Error | string | unknown, additionalContext?: ErrorContext): ErrorInfo {
    return processError(error, { ...this.context, ...additionalContext })
  }
  
  // 处理异步操作错误
  async handleAsync<T>(
    operation: () => Promise<T>,
    additionalContext?: ErrorContext
  ): Promise<{ success: true; data: T } | { success: false; error: ErrorInfo }> {
    try {
      const data = await operation()
      return { success: true, data }
    } catch (error) {
      const errorInfo = this.handle(error, additionalContext)
      return { success: false, error: errorInfo }
    }
  }
  
  // 处理同步操作错误
  handleSync<T>(
    operation: () => T,
    additionalContext?: ErrorContext
  ): { success: true; data: T } | { success: false; error: ErrorInfo } {
    try {
      const data = operation()
      return { success: true, data }
    } catch (error) {
      const errorInfo = this.handle(error, additionalContext)
      return { success: false, error: errorInfo }
    }
  }
  
  // 更新上下文
  updateContext(context: Partial<ErrorContext>) {
    this.context = { ...this.context, ...context }
  }
}

// 全局错误处理器实例
export const globalErrorHandler = new ErrorHandler()

// 便捷函数
export function handleError(error: Error | string | unknown, context?: ErrorContext): ErrorInfo {
  return globalErrorHandler.handle(error, context)
}

export function createErrorHandler(context: ErrorContext): ErrorHandler {
  return new ErrorHandler(context)
}

// 重试机制
export interface RetryOptions {
  maxAttempts: number
  delay: number
  backoff: 'linear' | 'exponential'
  retryCondition?: (error: ErrorInfo) => boolean
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: ErrorContext
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 'exponential',
    retryCondition = (error) => error.retryable
  } = options
  
  let lastError: ErrorInfo | null = null
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = processError(error, { ...context, attempt })
      
      // 如果是最后一次尝试或错误不可重试，直接抛出
      if (attempt === maxAttempts || !retryCondition(lastError)) {
        throw new Error(lastError.userMessage)
      }
      
      // 计算延迟时间
      const currentDelay = backoff === 'exponential' 
        ? delay * Math.pow(2, attempt - 1)
        : delay * attempt
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, currentDelay))
    }
  }
  
  // 理论上不会到达这里，但为了类型安全
  throw new Error(lastError?.userMessage || '操作失败')
}