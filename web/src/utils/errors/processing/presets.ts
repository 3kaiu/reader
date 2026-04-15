import { ErrorSeverity, getErrorStatusValue, toErrorLike } from '../core'
import type { KnownErrorPreset } from './types'

export const KNOWN_ERROR_PRESETS: readonly KnownErrorPreset[] = [
  {
    match: (message: string, error: unknown) =>
      getErrorStatusValue(error) === 401 || message.toLowerCase().includes('unauthorized'),
    code: 'UNAUTHORIZED',
    severity: ErrorSeverity.HIGH,
    userMessage: '登录已过期，请重新登录',
    retryable: false,
  },
  {
    match: (message: string, error: unknown) =>
      getErrorStatusValue(error) === 403 || message.toLowerCase().includes('forbidden'),
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
    match: (message: string, error: unknown) => {
      const normalized = message.toLowerCase()
      return (
        toErrorLike(error).name === 'AbortError' ||
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
    match: (message: string, error: unknown) =>
      error instanceof SyntaxError || message.toLowerCase().includes('syntaxerror'),
    code: 'SYNTAX_ERROR',
    severity: ErrorSeverity.LOW,
    userMessage: '数据格式错误，请重试',
    retryable: false,
  },
] as const

export function resolveErrorPreset(message: string, error: unknown) {
  return KNOWN_ERROR_PRESETS.find(preset => preset.match(message, error))
}
