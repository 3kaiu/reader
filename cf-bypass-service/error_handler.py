"""
Enhanced Error Handler for CF Bypass Service
Provides detailed error classification, handling, and graceful degradation.
"""
import logging
import traceback
from enum import Enum
from typing import Dict, Optional, Any, Tuple
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

class ErrorCategory(Enum):
    """Error categories for classification"""
    NETWORK_ERROR = "network_error"
    CLOUDFLARE_CHALLENGE = "cloudflare_challenge"
    TLS_SSL_ERROR = "tls_ssl_error"
    PROXY_ERROR = "proxy_error"
    TIMEOUT_ERROR = "timeout_error"
    CONFIGURATION_ERROR = "configuration_error"
    VALIDATION_ERROR = "validation_error"
    CACHE_ERROR = "cache_error"
    UNKNOWN_ERROR = "unknown_error"

class ErrorSeverity(Enum):
    """Error severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class ErrorInfo:
    """Structured error information"""
    category: ErrorCategory
    severity: ErrorSeverity
    message: str
    original_error: Optional[Exception] = None
    domain: Optional[str] = None
    url: Optional[str] = None
    timestamp: datetime = None
    retry_recommended: bool = False
    fallback_available: bool = False
    user_message: Optional[str] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

class EnhancedErrorHandler:
    """Enhanced error handler with classification and recovery strategies"""
    
    def __init__(self):
        self.error_patterns = self._initialize_error_patterns()
        self.recovery_strategies = self._initialize_recovery_strategies()
    
    def _initialize_error_patterns(self) -> Dict[str, Tuple[ErrorCategory, ErrorSeverity]]:
        """Initialize error pattern matching"""
        return {
            # Network errors
            "connection refused": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.HIGH),
            "connection timeout": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            "connection reset": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.MEDIUM),
            "network unreachable": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.HIGH),
            "dns resolution failed": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.HIGH),
            "no route to host": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.HIGH),
            
            # CloudFlare specific
            "just a moment": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "challenge-platform": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "checking your browser": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "ddos protection": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "security check": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "cloudflare": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            
            # TLS/SSL errors
            "ssl handshake failed": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.HIGH),
            "certificate verify failed": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.HIGH),
            "ssl connection error": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.HIGH),
            "tls handshake timeout": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.MEDIUM),
            "invalid library": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.HIGH),
            "openssl": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.MEDIUM),
            
            # Proxy errors
            "proxy connection failed": (ErrorCategory.PROXY_ERROR, ErrorSeverity.HIGH),
            "proxy authentication": (ErrorCategory.PROXY_ERROR, ErrorSeverity.HIGH),
            "proxy timeout": (ErrorCategory.PROXY_ERROR, ErrorSeverity.MEDIUM),
            "tunnel connection failed": (ErrorCategory.PROXY_ERROR, ErrorSeverity.HIGH),
            
            # Timeout errors
            "read timeout": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            "connect timeout": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            "request timeout": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            "operation timed out": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            
            # Configuration errors
            "invalid configuration": (ErrorCategory.CONFIGURATION_ERROR, ErrorSeverity.HIGH),
            "missing required": (ErrorCategory.CONFIGURATION_ERROR, ErrorSeverity.HIGH),
            "invalid browser": (ErrorCategory.CONFIGURATION_ERROR, ErrorSeverity.HIGH),
            "invalid proxy": (ErrorCategory.CONFIGURATION_ERROR, ErrorSeverity.HIGH),
            
            # Cache errors
            "redis connection": (ErrorCategory.CACHE_ERROR, ErrorSeverity.LOW),
            "cache unavailable": (ErrorCategory.CACHE_ERROR, ErrorSeverity.LOW),
            "serialization error": (ErrorCategory.CACHE_ERROR, ErrorSeverity.LOW),
        }
    
    def _initialize_recovery_strategies(self) -> Dict[ErrorCategory, Dict[str, Any]]:
        """Initialize recovery strategies for different error types"""
        return {
            ErrorCategory.NETWORK_ERROR: {
                "retry": True,
                "max_retries": 3,
                "backoff_factor": 2.0,
                "fallback": "direct_connection",
                "user_message": "Network connectivity issue. Retrying with different approach."
            },
            ErrorCategory.CLOUDFLARE_CHALLENGE: {
                "retry": True,
                "max_retries": 2,
                "backoff_factor": 1.5,
                "fallback": "session_reset",
                "user_message": "Encountered anti-bot protection. Attempting to solve challenge."
            },
            ErrorCategory.TLS_SSL_ERROR: {
                "retry": True,
                "max_retries": 2,
                "backoff_factor": 1.0,
                "fallback": "alternative_tls_config",
                "user_message": "SSL/TLS connection issue. Trying alternative configuration."
            },
            ErrorCategory.PROXY_ERROR: {
                "retry": True,
                "max_retries": 2,
                "backoff_factor": 1.0,
                "fallback": "next_proxy_or_direct",
                "user_message": "Proxy connection failed. Switching to alternative proxy."
            },
            ErrorCategory.TIMEOUT_ERROR: {
                "retry": True,
                "max_retries": 2,
                "backoff_factor": 1.5,
                "fallback": "increase_timeout",
                "user_message": "Request timed out. Retrying with extended timeout."
            },
            ErrorCategory.CONFIGURATION_ERROR: {
                "retry": False,
                "max_retries": 0,
                "backoff_factor": 1.0,
                "fallback": "default_config",
                "user_message": "Configuration error detected. Using default settings."
            },
            ErrorCategory.CACHE_ERROR: {
                "retry": False,
                "max_retries": 0,
                "backoff_factor": 1.0,
                "fallback": "bypass_cache",
                "user_message": "Cache temporarily unavailable. Proceeding without cache."
            },
            ErrorCategory.UNKNOWN_ERROR: {
                "retry": True,
                "max_retries": 1,
                "backoff_factor": 1.0,
                "fallback": "basic_retry",
                "user_message": "Unexpected error occurred. Attempting recovery."
            }
        }
    
    def classify_error(self, error: Exception, context: Dict[str, Any] = None) -> ErrorInfo:
        """Classify an error and return structured error information"""
        if context is None:
            context = {}
        
        error_message = str(error).lower()
        error_type = type(error).__name__
        
        # Try to match error patterns
        category = ErrorCategory.UNKNOWN_ERROR
        severity = ErrorSeverity.MEDIUM
        
        for pattern, (cat, sev) in self.error_patterns.items():
            if pattern in error_message:
                category = cat
                severity = sev
                break
        
        # Adjust severity based on error type
        if "ConnectionError" in error_type or "TimeoutError" in error_type:
            if severity == ErrorSeverity.MEDIUM:
                severity = ErrorSeverity.HIGH
        
        # Get recovery strategy
        strategy = self.recovery_strategies.get(category, {})
        
        # Create error info
        error_info = ErrorInfo(
            category=category,
            severity=severity,
            message=str(error),
            original_error=error,
            domain=context.get("domain"),
            url=context.get("url"),
            retry_recommended=strategy.get("retry", False),
            fallback_available=bool(strategy.get("fallback")),
            user_message=strategy.get("user_message")
        )
        
        # Log the classified error
        self._log_classified_error(error_info)
        
        return error_info
    
    def _log_classified_error(self, error_info: ErrorInfo):
        """Log classified error with appropriate level"""
        log_message = f"[{error_info.category.value.upper()}] {error_info.message}"
        
        if error_info.domain:
            log_message += f" (Domain: {error_info.domain})"
        
        if error_info.severity == ErrorSeverity.CRITICAL:
            logger.critical(log_message)
        elif error_info.severity == ErrorSeverity.HIGH:
            logger.error(log_message)
        elif error_info.severity == ErrorSeverity.MEDIUM:
            logger.warning(log_message)
        else:
            logger.info(log_message)
        
        # Log stack trace for high severity errors
        if error_info.severity in [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL] and error_info.original_error:
            logger.debug("Stack trace:", exc_info=error_info.original_error)
    
    def get_recovery_strategy(self, error_info: ErrorInfo) -> Dict[str, Any]:
        """Get recovery strategy for an error"""
        return self.recovery_strategies.get(error_info.category, {})
    
    def should_retry(self, error_info: ErrorInfo, attempt_count: int) -> bool:
        """Determine if an error should trigger a retry"""
        strategy = self.get_recovery_strategy(error_info)
        
        if not strategy.get("retry", False):
            return False
        
        max_retries = strategy.get("max_retries", 1)
        return attempt_count < max_retries
    
    def get_backoff_delay(self, error_info: ErrorInfo, attempt_count: int) -> float:
        """Calculate backoff delay for retry"""
        strategy = self.get_recovery_strategy(error_info)
        base_delay = 1.0
        backoff_factor = strategy.get("backoff_factor", 1.0)
        
        return base_delay * (backoff_factor ** attempt_count)
    
    def handle_graceful_degradation(self, error_info: ErrorInfo, context: Dict[str, Any]) -> Dict[str, Any]:
        """Handle graceful degradation based on error type"""
        strategy = self.get_recovery_strategy(error_info)
        fallback = strategy.get("fallback")
        
        degradation_actions = {}
        
        if fallback == "bypass_cache":
            degradation_actions["disable_cache"] = True
            logger.info("Degrading to bypass cache due to cache errors")
        
        elif fallback == "direct_connection":
            degradation_actions["disable_proxy"] = True
            logger.info("Degrading to direct connection due to network errors")
        
        elif fallback == "session_reset":
            degradation_actions["reset_session"] = True
            logger.info("Degrading to session reset due to challenge detection")
        
        elif fallback == "alternative_tls_config":
            degradation_actions["use_alternative_tls"] = True
            logger.info("Degrading to alternative TLS configuration")
        
        elif fallback == "next_proxy_or_direct":
            degradation_actions["rotate_proxy"] = True
            degradation_actions["fallback_direct"] = True
            logger.info("Degrading to next proxy or direct connection")
        
        elif fallback == "increase_timeout":
            current_timeout = context.get("timeout", 30)
            degradation_actions["timeout"] = min(current_timeout * 2, 120)
            logger.info(f"Degrading to increased timeout: {degradation_actions['timeout']}s")
        
        elif fallback == "default_config":
            degradation_actions["use_default_config"] = True
            logger.info("Degrading to default configuration")
        
        return degradation_actions
    
    def create_user_friendly_error(self, error_info: ErrorInfo) -> Dict[str, Any]:
        """Create user-friendly error response"""
        return {
            "error": True,
            "error_type": error_info.category.value,
            "message": error_info.user_message or "An error occurred while processing your request",
            "severity": error_info.severity.value,
            "retry_recommended": error_info.retry_recommended,
            "timestamp": error_info.timestamp.isoformat(),
            "domain": error_info.domain
        }

# Global error handler instance
error_handler = EnhancedErrorHandler()

# Convenience functions
def classify_error(error: Exception, context: Dict[str, Any] = None) -> ErrorInfo:
    """Classify an error using the global error handler"""
    return error_handler.classify_error(error, context)

def should_retry_error(error_info: ErrorInfo, attempt_count: int) -> bool:
    """Check if error should trigger retry"""
    return error_handler.should_retry(error_info, attempt_count)

def get_error_backoff_delay(error_info: ErrorInfo, attempt_count: int) -> float:
    """Get backoff delay for error retry"""
    return error_handler.get_backoff_delay(error_info, attempt_count)