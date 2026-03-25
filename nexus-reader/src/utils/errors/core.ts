/**
 * Core error API barrel.
 * Keeps imports stable while the implementation is layered.
 */

export {
  getErrorMessageValue,
  getErrorStackValue,
  getErrorStatusValue,
  stringifyError,
  toErrorLike,
} from './core/helpers'
export {
  NexusError,
  isNexusError,
} from './core/nexus-error'
export {
  ErrorCode,
  ErrorSeverity,
  type ErrorContext,
  type ErrorLike,
  type ErrorResponse,
  type KnownErrorPreset,
} from './core/types'
