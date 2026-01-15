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
  code: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  userMessage: string
  retryable: boolean
  context?: ErrorContext
}

// 错误类型映射 - 合并了所有错误类型
const ERROR_MAPPINGS: Record<string, Partial<ErrorInfo>> = {
  // === 网络错误 ===
  'NetworkError': {
    code: 'NETWORK_ERROR',
    severity: 'medium',
    userMessage: '网络连接异常，请检查网络后重试',
    retryable: true
  },
  'NetworkException': {
    code: 'NETWORK_EXCEPTION',
    severity: 'medium',
    userMessage: '网络连接失败，请检查网络后重试',
    retryable: true
  },
  'TimeoutError': {
    code: 'TIMEOUT_ERROR', 
    severity: 'medium',
    userMessage: '请求超时，请稍后重试',
    retryable: true
  },
  'TimeoutException': {
    code: 'TIMEOUT_EXCEPTION',
    severity: 'medium',
    userMessage: '请求超时，请重试或检查书源连通性',
    retryable: true
  },
  'fetch failed': {
    code: 'FETCH_FAILED',
    severity: 'medium',
    userMessage: '网络请求失败，请检查网络连接',
    retryable: true
  },
  'Failed to fetch': {
    code: 'FETCH_FAILED',
    severity: 'medium',
    userMessage: '无法连接到服务器，请检查网络或代理设置',
    retryable: true
  },
  'Network request failed': {
    code: 'NETWORK_REQUEST_FAILED',
    severity: 'medium',
    userMessage: '网络异常，请确认服务器与书源均可连接',
    retryable: true
  },
  'ERR_NAME_NOT_RESOLVED': {
    code: 'DNS_ERROR',
    severity: 'medium',
    userMessage: '无法解析域名，请检查 DNS 或书源地址',
    retryable: true
  },
  'ERR_CONNECTION_REFUSED': {
    code: 'CONNECTION_REFUSED',
    severity: 'medium',
    userMessage: '服务器拒绝连接，请检查服务是否在线',
    retryable: true
  },
  
  // === API/认证错误 ===
  'Unauthorized': {
    code: 'UNAUTHORIZED',
    severity: 'high',
    userMessage: '登录已过期，请重新登录',
    retryable: false
  },
  'NEED_LOGIN': {
    code: 'NEED_LOGIN',
    severity: 'high',
    userMessage: '请先登录 Nexus 账号',
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
  'NotFound': {
    code: 'NOT_FOUND',
    severity: 'medium',
    userMessage: '请求的资源已丢失或不存在',
    retryable: false
  },
  'Internal Server Error': {
    code: 'SERVER_ERROR',
    severity: 'high',
    userMessage: '服务器内部错误，请稍后重试',
    retryable: true
  },
  'ServerError': {
    code: 'SERVER_ERROR',
    severity: 'high',
    userMessage: '服务器内部异常，正在尝试自我恢复...',
    retryable: true
  },
  'BadRequest': {
    code: 'BAD_REQUEST',
    severity: 'medium',
    userMessage: '请求指令有误，请刷新页面后重试',
    retryable: false
  },
  
  // === 书源/解析错误 ===
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
  'TocEmptyException': {
    code: 'TOC_EMPTY',
    severity: 'medium',
    userMessage: '目录为空或无法提取，书源解析规则可能已过期',
    retryable: true
  },
  'SourceException': {
    code: 'SOURCE_ERROR',
    severity: 'medium',
    userMessage: '书源规则匹配失败，请尝试刷新或切换引擎',
    retryable: true
  },
  'ContentEmptyException': {
    code: 'CONTENT_EMPTY',
    severity: 'medium',
    userMessage: '正文提取失败，章节内容可能已被屏蔽或需要重新加载',
    retryable: true
  },
  'ConcurrentException': {
    code: 'CONCURRENT_LIMIT',
    severity: 'medium',
    userMessage: '当前并发请求过多，书源已限制频率，请稍候',
    retryable: true
  },
  'NullPointerException': {
    code: 'NULL_POINTER',
    severity: 'medium',
    userMessage: '处理响应数据时发生空引用，请反馈书源异常',
    retryable: true
  },
  'SSLException': {
    code: 'SSL_ERROR',
    severity: 'medium',
    userMessage: '与书源建立安全连接失败（SSL 握手错误），请换源',
    retryable: false
  },
  'UnknownHostException': {
    code: 'UNKNOWN_HOST',
    severity: 'medium',
    userMessage: '书源地址找不到（域名解析失败），请确认书源有效性',
    retryable: false
  },
  'Empty group name': {
    code: 'EMPTY_GROUP_NAME',
    severity: 'low',
    userMessage: '分组名称不能为空',
    retryable: false
  },
  'Book not found': {
    code: 'BOOK_NOT_FOUND',
    severity: 'medium',
    userMessage: '找不到该书籍的相关记录',
    retryable: false
  },
  
  // === 存储错误 ===
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
  
  // === 解析错误 ===
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
  },
  
  // === 通用错误 ===
  'UnknownError': {
    code: 'UNKNOWN_ERROR',
    severity: 'medium',
    userMessage: '发生未知系统错误，请查看日志或重试',
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
  } else if (typeof error === 'object' && error !== null) {
    // 处理对象类型的错误（包含 message 属性）
    const err = error as Record<string, unknown>
    originalMessage = String(err.message || err.error || err.errorMsg || '未知错误')
    errorName = 'UnknownError'
  } else {
    originalMessage = String(error)
    errorName = 'UnknownError'
  }
  
  // 移除 Java 异常前缀，只保留冒号后的信息
  if (originalMessage.includes('Exception:')) {
    const parts = originalMessage.split(':')
    if (parts.length > 1) {
      const cleanMessage = parts.slice(1).join(':').trim()
      // 只有在清理后的消息非空且不只是空白时才使用
      if (cleanMessage && cleanMessage.trim().length > 0) {
        originalMessage = cleanMessage
      }
    }
  }
  
  // 如果是很长的技术性错误，简化显示
  let simplifiedMessage = originalMessage
  if (
    originalMessage.length > 100 &&
    originalMessage.includes('.') &&
    originalMessage.includes('Exception')
  ) {
    simplifiedMessage = '操作失败，请稍后重试'
  }
  
  // 尝试匹配已知错误类型
  const matchedInfo = matchErrorType(originalMessage) || matchErrorType(errorName)
  
  const errorInfo: ErrorInfo = {
    message: originalMessage,
    code: matchedInfo?.code || 'UNKNOWN_ERROR',
    severity: matchedInfo?.severity || 'medium',
    // 确保 userMessage 非空
    userMessage: matchedInfo?.userMessage || (simplifiedMessage.trim() || '操作失败，请重试'),
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