export enum ErrorCode {
  NETWORK_ERROR = 1000,
  TIMEOUT = 1001,
  DNS_RESOLUTION_FAILED = 1002,
  CONNECTION_REFUSED = 1003,
  TLS_HANDSHAKE_FAILED = 1004,

  CLOUDFLARE_CHALLENGE = 2000,
  CLOUDFLARE_CHALLENGE_FAILED = 2001,
  RATE_LIMITED = 2002,
  IP_BANNED = 2003,
  ALL_STRATEGIES_FAILED = 2004,
  CIRCUIT_OPEN = 2005,
  STRATEGY_DISABLED = 2006,

  HTML_PARSE_ERROR = 3000,
  RULE_MISMATCH = 3001,
  JSON_PARSE_ERROR = 3002,
  INVALID_SELECTOR = 3003,
  CONTENT_EXTRACTION_FAILED = 3004,

  SOURCE_NOT_FOUND = 5000,
  DATABASE_ERROR = 5001,
  FILE_IO_ERROR = 5002,
  CACHE_MISS = 5003,
  STORAGE_QUOTA_EXCEEDED = 5004,

  UNAUTHORIZED = 7000,
  FORBIDDEN = 7001,
  INVALID_TOKEN = 7002,
  TOKEN_EXPIRED = 7003,
  INSUFFICIENT_PERMISSIONS = 7004,

  INVALID_CONFIG = 8000,
  CONFIG_NOT_FOUND = 8001,
  CONFIG_VALIDATION_FAILED = 8002,

  MODEL_LOAD_FAILED = 9000,
  INFERENCE_FAILED = 9001,
  UNSUPPORTED_MODEL_TYPE = 9002,
  MODEL_TIMEOUT = 9003,
  INSUFFICIENT_RESOURCES = 9004,

  UI_RENDER_ERROR = 11000,
  COMPONENT_LOAD_FAILED = 11001,
  VIRTUAL_SCROLL_ERROR = 11002,
  PERFORMANCE_DEGRADATION = 11003,

  INTERNAL_ERROR = 0,
  UNKNOWN_ERROR = 1,
  VALIDATION_ERROR = 2,
  SERIALIZATION_ERROR = 3,
  DESERIALIZATION_ERROR = 4,
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  [key: string]: unknown
  url?: string | null
  userId?: string | null
  sessionId?: string | null
  component?: string | null
  action?: string | null
  timestamp?: number
  retryAfter?: number | string
}

export interface ErrorResponse {
  code: ErrorCode
  severity: ErrorSeverity
  message: string
  details?: string
  timestamp: number
  requestId?: string
  context?: ErrorContext
}

export interface ErrorLike {
  name?: string
  message?: string
  stack?: string
  status?: number
  errorMsg?: string
  error?: string
  toString?: () => string
}

export interface KnownErrorPreset {
  match: (message: string, error: unknown) => boolean
  code: string
  severity: ErrorSeverity
  userMessage: string
  retryable: boolean
}
