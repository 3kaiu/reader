/**
 * Public error API barrel.
 * Keeps external imports stable while the internal error system is layered.
 */

export {
  ErrorCode,
  ErrorSeverity,
  NexusError,
  isNexusError,
  type ErrorContext,
  type ErrorResponse,
} from './errors/core'

export {
  createErrorBoundary,
  globalErrorBoundary,
  reportError,
  errorHandler,
  syncErrorHandler,
} from './errors/boundary'

export {
  processError,
  withRetry,
  type ErrorInfo,
} from './errors/processing'
