import {
  isNexusError,
  toErrorLike,
} from '../core'

export function normalizeErrorCode(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return normalized || 'UNKNOWN_ERROR'
}

export function cleanErrorMessage(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) {
    return 'Unknown error'
  }

  const withoutJavaPrefix = trimmed.replace(
    /^(?:[\w$.]+(?:Exception|Error)):\s+/,
    '',
  )

  return withoutJavaPrefix.trim() || trimmed
}

export function extractErrorMessage(error: unknown): string {
  if (isNexusError(error)) {
    return cleanErrorMessage(error.message)
  }

  if (error instanceof Error) {
    return cleanErrorMessage(error.message || error.name || 'Unknown error')
  }

  if (typeof error === 'string') {
    return cleanErrorMessage(error)
  }

  if (error && typeof error === 'object') {
    const errorLike = toErrorLike(error)
    const candidate = [
      errorLike.errorMsg,
      errorLike.message,
      errorLike.error,
    ].find(value => typeof value === 'string' && value.trim().length > 0)
    if (candidate) {
      return cleanErrorMessage(candidate)
    }
  }

  return cleanErrorMessage(String(error ?? 'Unknown error'))
}

export function mapUserMessageByCode(code: string, fallback: string): string {
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
