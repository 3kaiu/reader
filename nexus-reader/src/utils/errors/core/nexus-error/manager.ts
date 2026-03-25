import type {
  ErrorContext,
  ErrorResponse,
} from '../types'
import {
  ErrorCode,
  type ErrorSeverity,
} from '../types'
import {
  createAIErrorInput,
  createNetworkErrorInput,
  createValidationErrorInput,
} from './factories'
import {
  isRetryableErrorCode,
  resolveRetryDelay,
} from './retry'
import { resolveErrorSeverity } from './severity'

export class NexusError extends Error {
  public readonly code: ErrorCode
  public readonly severity: ErrorSeverity
  public readonly details?: string
  public readonly context?: ErrorContext
  public readonly timestamp: number
  public readonly requestId?: string

  constructor(
    code: ErrorCode,
    message: string,
    details?: string,
    context?: ErrorContext,
    requestId?: string
  ) {
    super(message)
    this.name = 'NexusError'
    this.code = code
    this.details = details
    this.context = context
    this.timestamp = Date.now()
    this.requestId = requestId
    this.severity = resolveErrorSeverity(code)
  }

  get isRetryable(): boolean {
    return isRetryableErrorCode(this.code)
  }

  get retryDelay(): number | null {
    return resolveRetryDelay(this.code, this.context)
  }

  toErrorResponse(): ErrorResponse {
    return {
      code: this.code,
      severity: this.severity,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      context: this.context,
    }
  }

  static fromNetworkError(error: unknown, url?: string): NexusError {
    const input = createNetworkErrorInput(error, url)
    return new NexusError(input.code, input.message, input.details, input.context)
  }

  static fromValidationError(field: string, message: string): NexusError {
    const input = createValidationErrorInput(field, message)
    return new NexusError(input.code, input.message, input.details, input.context)
  }

  static fromAIError(error: unknown, modelId?: string): NexusError {
    const input = createAIErrorInput(error, modelId)
    return new NexusError(input.code, input.message, input.details, input.context)
  }
}

export function isNexusError(error: unknown): error is NexusError {
  return error instanceof NexusError
}
