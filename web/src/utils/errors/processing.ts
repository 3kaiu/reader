import { ErrorCode, ErrorSeverity, type ErrorContext, NexusError } from './core'
import { logProcessedError } from './processing/logging'
import {
  extractErrorMessage,
  mapUserMessageByCode,
  normalizeErrorCode,
} from './processing/normalize'
import { resolveErrorPreset } from './processing/presets'
import { withProcessedRetry } from './processing/retry'
import type { ErrorInfo } from './processing/types'

export type { ErrorInfo } from './processing/types'

export function processError(error: unknown, context?: ErrorContext): ErrorInfo {
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
    context,
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: 'linear' | 'exponential'
  } = {}
): Promise<T> {
  return await withProcessedRetry(operation, processError, options)
}
