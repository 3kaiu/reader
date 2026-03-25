import {
  getLocalStorageItem,
  getSessionStorageItem,
} from '../browserStorage'
import { logger } from '../logger'
import {
  ErrorCode,
  NexusError,
  type ErrorContext,
  getErrorMessageValue,
  getErrorStackValue,
  isNexusError,
  stringifyError,
} from './core'

function getRuntimeErrorContext(): Pick<ErrorContext, 'url'> & { userAgent?: string } {
  return {
    userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    url: typeof window === 'undefined' ? null : window.location.href,
  }
}

export function createErrorBoundary() {
  return {
    error: null as NexusError | null,

    capture(error: unknown, context?: ErrorContext): NexusError {
      if (isNexusError(error)) {
        this.error = error
        return error
      }

      const errorMessage = getErrorMessageValue(error) || 'An unexpected error occurred'
      const errorStack = getErrorStackValue(error)
      const runtimeContext = getRuntimeErrorContext()

      const nexusError = new NexusError(
        ErrorCode.INTERNAL_ERROR,
        errorMessage,
        errorStack,
        {
          ...context,
          originalError: stringifyError(error),
          userAgent: runtimeContext.userAgent,
          url: runtimeContext.url,
        }
      )

      this.error = nexusError
      return nexusError
    },

    clear() {
      this.error = null
    },

    getLastError() {
      return this.error
    }
  }
}

export const globalErrorBoundary = createErrorBoundary()

export function reportError(error: NexusError, additionalContext?: ErrorContext) {
  const errorReport = {
    ...error.toErrorResponse(),
    context: {
      ...error.context,
      ...additionalContext,
      userId: getLocalStorageItem('user_id'),
      sessionId: getSessionStorageItem('session_id'),
    }
  }

  if (import.meta.env.DEV) {
    logger.error('Nexus error', errorReport)
  }

  globalErrorBoundary.capture(error, additionalContext)
}

export function errorHandler(_target: object, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value as ((...args: unknown[]) => Promise<unknown>) | undefined
  if (!originalMethod) {
    return descriptor
  }

  descriptor.value = async function (...args: unknown[]) {
    try {
      return await originalMethod.apply(this, args)
    } catch (error: unknown) {
      if (isNexusError(error)) {
        throw error
      }

      const errorMessage = getErrorMessageValue(error) || 'Unknown error'
      const nexusError = new NexusError(
        ErrorCode.INTERNAL_ERROR,
        `Error in ${propertyKey}: ${errorMessage}`,
        getErrorStackValue(error),
        {
          method: propertyKey,
          args: args.map(arg => typeof arg === 'object' ? '[Object]' : String(arg)),
          originalError: stringifyError(error)
        }
      )

      reportError(nexusError)
      throw nexusError
    }
  }

  return descriptor
}

export function syncErrorHandler(_target: object, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value as ((...args: unknown[]) => unknown) | undefined
  if (!originalMethod) {
    return descriptor
  }

  descriptor.value = function (...args: unknown[]) {
    try {
      return originalMethod.apply(this, args)
    } catch (error: unknown) {
      if (isNexusError(error)) {
        throw error
      }

      const errorMessage = getErrorMessageValue(error) || 'Unknown error'
      const nexusError = new NexusError(
        ErrorCode.INTERNAL_ERROR,
        `Error in ${propertyKey}: ${errorMessage}`,
        getErrorStackValue(error),
        {
          method: propertyKey,
          args: args.map(arg => typeof arg === 'object' ? '[Object]' : String(arg)),
          originalError: stringifyError(error)
        }
      )

      reportError(nexusError)
      throw nexusError
    }
  }

  return descriptor
}
