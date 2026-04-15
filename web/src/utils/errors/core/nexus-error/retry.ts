import type { ErrorContext } from '../types'
import { ErrorCode } from '../types'

const RETRYABLE_ERROR_CODES: readonly ErrorCode[] = [
  ErrorCode.NETWORK_ERROR,
  ErrorCode.TIMEOUT,
  ErrorCode.RATE_LIMITED,
  ErrorCode.CLOUDFLARE_CHALLENGE,
  ErrorCode.CONNECTION_REFUSED,
  ErrorCode.TLS_HANDSHAKE_FAILED,
  ErrorCode.MODEL_TIMEOUT,
] as const

export function isRetryableErrorCode(code: ErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.includes(code)
}

export function resolveRetryDelay(code: ErrorCode, context?: ErrorContext): number | null {
  const retryAfterValue = context?.retryAfter
  const retryAfter =
    typeof retryAfterValue === 'number'
      ? retryAfterValue
      : typeof retryAfterValue === 'string'
        ? Number.parseInt(retryAfterValue, 10)
        : Number.NaN

  switch (code) {
    case ErrorCode.RATE_LIMITED:
      return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60
    case ErrorCode.TIMEOUT:
      return 1
    case ErrorCode.CLOUDFLARE_CHALLENGE:
      return 5
    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.CONNECTION_REFUSED:
      return 2
    case ErrorCode.TLS_HANDSHAKE_FAILED:
    case ErrorCode.MODEL_TIMEOUT:
      return 3
    default:
      return null
  }
}
