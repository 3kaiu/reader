import { useErrorHandler } from '@/composables/useErrorHandler'
import { logger } from '@/utils/logger'
import type { NexusError } from '@/utils/errors'
import { translateErrorMessage } from './messages'
import type { ErrorHandlerInstance } from './types'

let errorHandlerInstance: ErrorHandlerInstance | null = null

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
