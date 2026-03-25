import type {
  ErrorContext,
  ErrorSeverity,
  KnownErrorPreset,
} from '../core'

export interface ErrorInfo {
  message: string
  code: string
  severity: ErrorSeverity
  userMessage: string
  retryable: boolean
  context?: ErrorContext
}

export type StructuredLogMethod = (
  message: string,
  payload?: unknown,
  context?: ErrorContext,
) => void

export type { KnownErrorPreset }
