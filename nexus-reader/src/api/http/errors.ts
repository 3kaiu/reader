import { useErrorHandler } from '@/composables/useErrorHandler'
import { NexusError, ErrorCode } from '@/utils/errors'
import { logger } from '@/utils/logger'

const ERROR_MESSAGE_MAP: Record<string, string> = {
  'Network request failed': '网络连接失败，请检查网络后重试',
  'Request timeout': '请求超时，请稍后重试',
  'Failed to fetch': '无法连接到服务器，请检查网络',
  'Source not found': '书源不存在，请选择其他书源',
  'Book not found': '书籍不存在或已被删除',
  'Chapter not found': '章节不存在',
  'Rule mismatch': '内容解析失败，请尝试其他书源',
  'Internal server error': '服务器内部错误，请稍后重试',
  'Service temporarily unavailable': '服务暂时不可用，请稍后重试',
  'Bad request': '请求参数错误，请重试',
  Unauthorized: '登录已过期，请重新登录',
  Forbidden: '没有权限访问此资源',
}

interface ErrorHandlerInstance {
  handleError: (error: unknown, context?: string, showToast?: boolean) => void
}

let errorHandlerInstance: ErrorHandlerInstance | null = null

export function translateErrorMessage(errorMsg: string): string {
  if (ERROR_MESSAGE_MAP[errorMsg]) {
    return ERROR_MESSAGE_MAP[errorMsg]
  }

  for (const [pattern, friendlyMsg] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (errorMsg.toLowerCase().includes(pattern.toLowerCase())) {
      return friendlyMsg
    }
  }

  return errorMsg
}

export function convertToNexusError(error: any, url: string, method: string): NexusError {
  if (error instanceof NexusError) {
    return error
  }

  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return new NexusError(ErrorCode.TIMEOUT, '请求超时，请稍后重试', error.message, {
      url,
      method,
      originalError: error.toString(),
    })
  }

  if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
    return new NexusError(
      ErrorCode.NETWORK_ERROR,
      '网络连接失败，请检查网络后重试',
      error.message,
      { url, method, originalError: error.toString() }
    )
  }

  if (error.status === 401) {
    return new NexusError(ErrorCode.UNAUTHORIZED, '登录已过期，请重新登录', undefined, {
      url,
      method,
      status: error.status,
    })
  }

  if (error.status === 403) {
    return new NexusError(ErrorCode.FORBIDDEN, '没有权限访问此资源', undefined, {
      url,
      method,
      status: error.status,
    })
  }

  if (error.status === 429) {
    return new NexusError(ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后重试', undefined, {
      url,
      method,
      status: error.status,
      retryAfter: error.response?.headers?.['retry-after'],
    })
  }

  if (error.status >= 500) {
    return new NexusError(ErrorCode.INTERNAL_ERROR, '服务器内部错误，请稍后重试', undefined, {
      url,
      method,
      status: error.status,
    })
  }

  return new NexusError(
    ErrorCode.UNKNOWN_ERROR,
    translateErrorMessage(error.message || '未知错误'),
    error.message,
    { url, method, originalError: error.toString() }
  )
}

export function getGlobalErrorHandler(): ErrorHandlerInstance {
  if (!errorHandlerInstance) {
    errorHandlerInstance = useErrorHandler() as unknown as ErrorHandlerInstance
  }

  return errorHandlerInstance
}

export function reportBusinessError(errorMsg?: string): void {
  try {
    const handler = getGlobalErrorHandler()
    const userFriendlyMessage = translateErrorMessage(errorMsg || '业务操作失败')
    handler.handleError(userFriendlyMessage, '', false)
  } catch (error) {
    if (import.meta.env.DEV) {
      logger.error('API interceptor failed to report business error', { error })
    }
  }
}

export function reportRequestError(error: NexusError): void {
  try {
    const handler = getGlobalErrorHandler()
    handler.handleError(error.message, error.details || error.message)
  } catch (handlerError) {
    if (import.meta.env.DEV) {
      logger.error('API interceptor error handling failed', { error: handlerError })
    }
  }
}

export function isLikelyNetworkOrCorsError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '')
  return (
    (error as any)?.name === 'AbortError' ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    (message.toLowerCase().includes('fetch') && message.toLowerCase().includes('failed'))
  )
}
