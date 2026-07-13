/**
 * Public error API barrel.
 * Keeps external imports stable while the internal error system is layered.
 */

export {
  ErrorCode,
  NexusError,
  isNexusError,
  type ErrorContext,
} from './errors/core'

export {
  reportError,
} from './errors/boundary'

export { processError } from './errors/processing'
