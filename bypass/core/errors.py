"""
Unified Error Handling System for CF Bypass Service
Implements standardized error codes and responses compatible with Nexus ecosystem
"""

from enum import Enum
from typing import Dict, Any, Optional
from dataclasses import dataclass
import time


class ErrorCode(Enum):
    """Standardized error codes across all Nexus components"""

    # Network Layer (1000-1999)
    NETWORK_ERROR = 1000
    TIMEOUT = 1001
    DNS_RESOLUTION_FAILED = 1002
    CONNECTION_REFUSED = 1003
    TLS_HANDSHAKE_FAILED = 1004

    # Anti-Crawl Layer (2000-2999)
    CLOUDFLARE_CHALLENGE = 2000
    CLOUDFLARE_CHALLENGE_FAILED = 2001
    RATE_LIMITED = 2002
    IP_BANNED = 2003
    ALL_STRATEGIES_FAILED = 2004
    CIRCUIT_OPEN = 2005
    STRATEGY_DISABLED = 2006

    # Parse Layer (3000-3999)
    HTML_PARSE_ERROR = 3000
    RULE_MISMATCH = 3001
    JSON_PARSE_ERROR = 3002
    INVALID_SELECTOR = 3003
    CONTENT_EXTRACTION_FAILED = 3004

    # Script Layer (4000-4999)
    SCRIPT_EXECUTION_ERROR = 4000
    SCRIPT_TIMEOUT = 4001
    SCRIPT_MEMORY_EXCEEDED = 4002

    # Storage Layer (5000-5999)
    SOURCE_NOT_FOUND = 5000
    DATABASE_ERROR = 5001
    FILE_IO_ERROR = 5002
    CACHE_MISS = 5003
    STORAGE_QUOTA_EXCEEDED = 5004

    # Authentication Layer (7000-7999)
    UNAUTHORIZED = 7000
    FORBIDDEN = 7001
    INVALID_TOKEN = 7002
    TOKEN_EXPIRED = 7003
    INSUFFICIENT_PERMISSIONS = 7004

    # Configuration Layer (8000-8999)
    INVALID_CONFIG = 8000
    CONFIG_NOT_FOUND = 8001
    CONFIG_VALIDATION_FAILED = 8002

    # AI/ML Layer (9000-9999)
    MODEL_LOAD_FAILED = 9000
    INFERENCE_FAILED = 9001
    UNSUPPORTED_MODEL_TYPE = 9002
    MODEL_TIMEOUT = 9003
    INSUFFICIENT_RESOURCES = 9004

    # Generic (0000-0999)
    INTERNAL_ERROR = 0
    UNKNOWN_ERROR = 1
    VALIDATION_ERROR = 2
    SERIALIZATION_ERROR = 3
    DESERIALIZATION_ERROR = 4


class ErrorSeverity(Enum):
    """Error severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ErrorResponse:
    """Standardized error response structure"""
    code: ErrorCode
    severity: ErrorSeverity
    message: str
    details: Optional[str] = None
    timestamp: Optional[int] = None
    request_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = int(time.time() * 1000)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "code": self.code.value,
            "severity": self.severity.value,
            "message": self.message,
            "details": self.details,
            "timestamp": self.timestamp,
            "requestId": self.request_id,
            "context": self.context
        }


class BypassError(Exception):
    """
    Unified error class for CF Bypass Service
    Compatible with Nexus error protocol
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        details: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details
        self.context = context or {}
        self.cause = cause

        # Auto-determine severity based on error code
        self.severity = self._get_severity()

    def _get_severity(self) -> ErrorSeverity:
        """Determine severity based on error code"""
        critical_codes = [
            ErrorCode.CIRCUIT_OPEN,
            ErrorCode.ALL_STRATEGIES_FAILED,
            ErrorCode.STORAGE_QUOTA_EXCEEDED,
        ]

        high_codes = [
            ErrorCode.IP_BANNED,
            ErrorCode.CLOUDFLARE_CHALLENGE_FAILED,
            ErrorCode.INSUFFICIENT_RESOURCES,
            ErrorCode.RATE_LIMITED,
            ErrorCode.UNAUTHORIZED,
            ErrorCode.FORBIDDEN,
            ErrorCode.DATABASE_ERROR,
            ErrorCode.FILE_IO_ERROR,
            ErrorCode.INTERNAL_ERROR,
        ]

        medium_codes = [
            ErrorCode.TIMEOUT,
            ErrorCode.CONNECTION_REFUSED,
            ErrorCode.TLS_HANDSHAKE_FAILED,
            ErrorCode.CLOUDFLARE_CHALLENGE,
            ErrorCode.SCRIPT_TIMEOUT,
            ErrorCode.SCRIPT_MEMORY_EXCEEDED,
            ErrorCode.INVALID_CONFIG,
            ErrorCode.CONFIG_VALIDATION_FAILED,
        ]

        if self.code in critical_codes:
            return ErrorSeverity.CRITICAL
        elif self.code in high_codes:
            return ErrorSeverity.HIGH
        elif self.code in medium_codes:
            return ErrorSeverity.MEDIUM
        else:
            return ErrorSeverity.LOW

    @property
    def is_retryable(self) -> bool:
        """Check if this error is retryable"""
        retryable_codes = [
            ErrorCode.NETWORK_ERROR,
            ErrorCode.TIMEOUT,
            ErrorCode.RATE_LIMITED,
            ErrorCode.CLOUDFLARE_CHALLENGE,
            ErrorCode.CONNECTION_REFUSED,
            ErrorCode.TLS_HANDSHAKE_FAILED,
            ErrorCode.SCRIPT_TIMEOUT,
        ]
        return self.code in retryable_codes

    @property
    def retry_delay(self) -> Optional[int]:
        """Get suggested retry delay in seconds"""
        delay_map = {
            ErrorCode.RATE_LIMITED: lambda: self.context.get('retry_after', 60),
            ErrorCode.TIMEOUT: lambda: 1,
            ErrorCode.CLOUDFLARE_CHALLENGE: lambda: 5,
            ErrorCode.NETWORK_ERROR: lambda: 2,
            ErrorCode.CONNECTION_REFUSED: lambda: 2,
            ErrorCode.TLS_HANDSHAKE_FAILED: lambda: 3,
            ErrorCode.SCRIPT_TIMEOUT: lambda: 3,
        }

        delay_func = delay_map.get(self.code)
        return delay_func() if delay_func else None

    def to_error_response(self, request_id: Optional[str] = None) -> ErrorResponse:
        """Convert to standardized error response"""
        return ErrorResponse(
            code=self.code,
            severity=self.severity,
            message=self.message,
            details=self.details,
            request_id=request_id,
            context=self.context
        )

    @classmethod
    def from_cloudscraper_error(cls, error: Exception, url: Optional[str] = None) -> 'BypassError':
        """Convert cloudscraper exceptions to BypassError"""
        import cloudscraper

        if isinstance(error, cloudscraper.exceptions.CloudflareChallengeError):
            return cls(
                ErrorCode.CLOUDFLARE_CHALLENGE,
                "Cloudflare challenge detected",
                context={"url": url}
            )
        elif isinstance(error, cloudscraper.exceptions.CloudflareCaptchaError):
            return cls(
                ErrorCode.CLOUDFLARE_CHALLENGE_FAILED,
                "Cloudflare captcha challenge failed",
                context={"url": url}
            )
        elif isinstance(error, cloudscraper.exceptions.CloudflareIUAMError):
            return cls(
                ErrorCode.CLOUDFLARE_CHALLENGE_FAILED,
                "Cloudflare IUAM challenge failed",
                context={"url": url}
            )
        else:
            return cls(
                ErrorCode.NETWORK_ERROR,
                f"Network request failed: {str(error)}",
                context={"url": url, "original_error": str(error)}
            )


# Convenience functions for creating common errors
def network_error(message: str, url: Optional[str] = None) -> BypassError:
    return BypassError(
        ErrorCode.NETWORK_ERROR,
        message,
        context={"url": url}
    )


def timeout_error(url: Optional[str] = None) -> BypassError:
    return BypassError(
        ErrorCode.TIMEOUT,
        "Request timeout",
        context={"url": url}
    )


def cloudflare_challenge_error(url: Optional[str] = None) -> BypassError:
    return BypassError(
        ErrorCode.CLOUDFLARE_CHALLENGE,
        "Cloudflare challenge detected",
        context={"url": url}
    )


def config_error(message: str, key: Optional[str] = None) -> BypassError:
    return BypassError(
        ErrorCode.INVALID_CONFIG,
        f"Configuration error: {message}",
        context={"config_key": key}
    )


def internal_error(message: str, context: Optional[Dict[str, Any]] = None) -> BypassError:
    return BypassError(
        ErrorCode.INTERNAL_ERROR,
        f"Internal error: {message}",
        context=context or {}
    )


# Error handler decorator
def error_handler(func):
    """Decorator to handle and standardize errors in async functions"""
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except BypassError:
            raise  # Re-raise BypassError as-is
        except Exception as e:
            # Convert unknown errors to BypassError
            raise BypassError(
                ErrorCode.INTERNAL_ERROR,
                f"Unexpected error: {str(e)}",
                context={"function": func.__name__, "original_error": str(e)}
            ) from e
    return wrapper


# Synchronous error handler
def sync_error_handler(func):
    """Decorator to handle and standardize errors in sync functions"""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except BypassError:
            raise  # Re-raise BypassError as-is
        except Exception as e:
            # Convert unknown errors to BypassError
            raise BypassError(
                ErrorCode.INTERNAL_ERROR,
                f"Unexpected error: {str(e)}",
                context={"function": func.__name__, "original_error": str(e)}
            ) from e
    return wrapper