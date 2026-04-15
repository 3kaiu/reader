import { getErrorMessageValue, toErrorLike } from '../helpers'
import type { ErrorContext } from '../types'
import { ErrorCode } from '../types'

export interface NexusErrorInput {
  code: ErrorCode
  message: string
  details?: string
  context?: ErrorContext
}

export function createNetworkErrorInput(error: unknown, url?: string): NexusErrorInput {
  const errorLike = toErrorLike(error)
  const errorMessage = getErrorMessageValue(error) || 'Unknown network error'

  if (errorLike.name === 'AbortError') {
    return {
      code: ErrorCode.TIMEOUT,
      message: 'Request timeout',
      context: {
        url,
        originalError: errorMessage,
      },
    }
  }

  if (errorMessage.includes('NetworkError') || errorMessage.includes('fetch')) {
    return {
      code: ErrorCode.NETWORK_ERROR,
      message: 'Network request failed',
      details: errorMessage,
      context: {
        url,
        originalError: errorMessage,
        level: 'user',
      },
    }
  }

  return {
    code: ErrorCode.NETWORK_ERROR,
    message: errorMessage,
    context: {
      url,
      originalError: errorMessage,
      level: 'user',
    },
  }
}

export function createValidationErrorInput(field: string, message: string): NexusErrorInput {
  return {
    code: ErrorCode.VALIDATION_ERROR,
    message: `Validation failed for ${field}: ${message}`,
    context: { field },
  }
}

export function createAIErrorInput(error: unknown, modelId?: string): NexusErrorInput {
  const errorMessage = getErrorMessageValue(error)

  return {
    code: ErrorCode.INFERENCE_FAILED,
    message: 'AI inference failed',
    details: errorMessage,
    context: {
      modelId,
      originalError: errorMessage,
    },
  }
}
