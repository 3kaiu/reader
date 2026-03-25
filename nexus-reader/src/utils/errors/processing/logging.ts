import { logger } from '../../logger'
import { ErrorSeverity } from '../core'
import type { ErrorContext } from '../core'
import type { ErrorInfo, StructuredLogMethod } from './types'

export function logProcessedError(
  errorInfo: ErrorInfo,
  error: unknown,
  context?: ErrorContext,
) {
  const payload = {
    rawError: error,
    code: errorInfo.code,
    message: errorInfo.message,
    retryable: errorInfo.retryable,
    severity: errorInfo.severity,
  }

  const logMethod: StructuredLogMethod =
    errorInfo.severity === ErrorSeverity.CRITICAL ||
    errorInfo.severity === ErrorSeverity.HIGH
      ? logger.error.bind(logger)
      : errorInfo.severity === ErrorSeverity.MEDIUM
        ? logger.warn.bind(logger)
        : logger.info.bind(logger)

  logMethod('Processed error', payload, context)
}
