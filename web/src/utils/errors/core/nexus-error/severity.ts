import { ErrorCode, ErrorSeverity } from '../types'

const CRITICAL_ERROR_CODES: readonly ErrorCode[] = [
  ErrorCode.CIRCUIT_OPEN,
  ErrorCode.ALL_STRATEGIES_FAILED,
  ErrorCode.STORAGE_QUOTA_EXCEEDED,
  ErrorCode.INTERNAL_ERROR,
] as const

const HIGH_ERROR_CODES: readonly ErrorCode[] = [
  ErrorCode.IP_BANNED,
  ErrorCode.CLOUDFLARE_CHALLENGE_FAILED,
  ErrorCode.INSUFFICIENT_RESOURCES,
  ErrorCode.UNAUTHORIZED,
  ErrorCode.FORBIDDEN,
  ErrorCode.DATABASE_ERROR,
  ErrorCode.FILE_IO_ERROR,
  ErrorCode.UI_RENDER_ERROR,
] as const

const MEDIUM_ERROR_CODES: readonly ErrorCode[] = [
  ErrorCode.TIMEOUT,
  ErrorCode.CONNECTION_REFUSED,
  ErrorCode.TLS_HANDSHAKE_FAILED,
  ErrorCode.CLOUDFLARE_CHALLENGE,
  ErrorCode.RATE_LIMITED,
  ErrorCode.INVALID_CONFIG,
  ErrorCode.CONFIG_VALIDATION_FAILED,
  ErrorCode.MODEL_TIMEOUT,
  ErrorCode.PERFORMANCE_DEGRADATION,
] as const

export function resolveErrorSeverity(code: ErrorCode): ErrorSeverity {
  if (CRITICAL_ERROR_CODES.includes(code)) {
    return ErrorSeverity.CRITICAL
  }

  if (HIGH_ERROR_CODES.includes(code)) {
    return ErrorSeverity.HIGH
  }

  if (MEDIUM_ERROR_CODES.includes(code)) {
    return ErrorSeverity.MEDIUM
  }

  return ErrorSeverity.LOW
}
