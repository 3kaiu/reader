"""
Core Utilities for CF Bypass Service
Consolidated logging and error handling for high cohesion.
"""
import logging
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from enum import Enum
from dataclasses import dataclass, asdict
from collections import defaultdict

# ─────────────────────────────────────────────────────────────
# Shared Enums and Data Classes
# ─────────────────────────────────────────────────────────────

class LogCategory(Enum):
    """Log categories for structured logging"""
    REQUEST = "request"
    CHALLENGE = "challenge"
    PROXY = "proxy"
    CACHE = "cache"
    SESSION = "session"
    CONFIG = "config"
    ERROR = "error"
    PERFORMANCE = "performance"


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


# ─────────────────────────────────────────────────────────────
# Shared Utility Functions
# ─────────────────────────────────────────────────────────────

def sanitize_string(s: str) -> str:
    """Escape CRLF characters to prevent log injection"""
    return s.replace('\r', '\\r').replace('\n', '\\n')


def extract_domain(url: str) -> str:
    """Extract domain from URL"""
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc
    except Exception:
        return "unknown"


def mask_proxy_credentials(proxy_url: str) -> str:
    """Mask credentials in proxy URL for logging"""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(proxy_url)
        if parsed.username:
            masked_netloc = f"{parsed.username[:2]}***@{parsed.hostname}"
            if parsed.port:
                masked_netloc += f":{parsed.port}"
            return f"{parsed.scheme}://{masked_netloc}"
        return proxy_url
    except Exception:
        return proxy_url


# ─────────────────────────────────────────────────────────────
# Enhanced Logger
# ─────────────────────────────────────────────────────────────

class LogLevel(Enum):
    """Custom log levels"""
    CHALLENGE = 25
    PROXY = 22
    CACHE = 15


class CloudScraperFormatter(logging.Formatter):
    """Custom formatter with CRLF sanitization"""
    
    def __init__(self, use_json: bool = False):
        self.use_json = use_json
        if use_json:
            super().__init__()
        else:
            super().__init__(
                fmt='%(asctime)s - %(name)s - %(levelname)s - [%(category)s] %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
    
    def format(self, record):
        # Sanitize message and attributes
        if hasattr(record, 'msg') and isinstance(record.msg, str):
            record.msg = sanitize_string(record.msg)
            
        for attr in ['url', 'domain', 'challenge_type', 'proxy_used', 'session_id']:
            if hasattr(record, attr) and isinstance(getattr(record, attr), str):
                setattr(record, attr, sanitize_string(getattr(record, attr)))

        return self._format_json(record) if self.use_json else self._format_text(record)
    
    def _format_json(self, record) -> str:
        """Format as JSON"""
        log_data = {
            'timestamp': datetime.fromtimestamp(record.created).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'category': getattr(record, 'category', 'general')
        }
        
        for field in ['domain', 'url', 'duration', 'status_code', 'challenge_type', 
                     'proxy_used', 'cache_hit', 'session_id']:
            if hasattr(record, field):
                log_data[field] = getattr(record, field)
        
        if hasattr(record, 'extra_data') and record.extra_data:
            log_data.update(record.extra_data)
        
        return json.dumps(log_data)
    
    def _format_text(self, record) -> str:
        """Format as human-readable text"""
        if not hasattr(record, 'category'):
            record.category = 'general'
        
        base_message = super().format(record)
        
        extras = []
        if hasattr(record, 'domain') and record.domain:
            extras.append(f"domain={record.domain}")
        if hasattr(record, 'duration') and record.duration:
            extras.append(f"duration={record.duration:.2f}s")
        if hasattr(record, 'status_code') and record.status_code:
            extras.append(f"status={record.status_code}")
        if hasattr(record, 'challenge_type') and record.challenge_type:
            extras.append(f"challenge={record.challenge_type}")
        if hasattr(record, 'proxy_used') and record.proxy_used:
            extras.append(f"proxy={record.proxy_used}")
        if hasattr(record, 'cache_hit') and record.cache_hit is not None:
            extras.append(f"cache={'HIT' if record.cache_hit else 'MISS'}")
        
        if extras:
            base_message += f" ({', '.join(extras)})"
        
        return base_message


class EnhancedLogger:
    """Enhanced logger with CloudScraper-specific functionality"""
    
    def __init__(self, name: str = "cf-bypass", use_json: bool = False):
        self.logger = logging.getLogger(name)
        self.use_json = use_json
        
        # Add custom log levels
        logging.addLevelName(LogLevel.CHALLENGE.value, "CHALLENGE")
        logging.addLevelName(LogLevel.PROXY.value, "PROXY")
        logging.addLevelName(LogLevel.CACHE.value, "CACHE")
        
        # Set up handler if not configured
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(CloudScraperFormatter(use_json=use_json))
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def _log_with_context(self, level: int, category: LogCategory, message: str, **kwargs):
        """Log with structured context"""
        sanitized_message = sanitize_string(message)
        
        extra = {'category': category.value}
        for k, v in kwargs.items():
            extra[k] = sanitize_string(v) if isinstance(v, str) else v
        
        self.logger.log(level, sanitized_message, extra=extra)
    
    def request_start(self, url: str, method: str = "GET", domain: str = None, **kwargs):
        """Log request start"""
        self._log_with_context(
            logging.INFO, 
            LogCategory.REQUEST,
            f"Starting {method} request to {url}",
            url=url,
            domain=domain or extract_domain(url),
            **kwargs
        )
    
    def request_complete(self, url: str, status_code: int, duration: float, 
                        domain: str = None, **kwargs):
        """Log request completion"""
        self._log_with_context(
            logging.INFO,
            LogCategory.REQUEST,
            f"Request completed with status {status_code}",
            url=url,
            domain=domain or extract_domain(url),
            status_code=status_code,
            duration=duration,
            **kwargs
        )
    
    def challenge_detected(self, challenge_type: str, domain: str, url: str = None, **kwargs):
        """Log CloudFlare challenge detection"""
        self._log_with_context(
            LogLevel.CHALLENGE.value,
            LogCategory.CHALLENGE,
            f"CloudFlare challenge detected: {challenge_type}",
            domain=domain,
            url=url,
            challenge_type=challenge_type,
            **kwargs
        )
    
    def challenge_solved(self, challenge_type: str, domain: str, duration: float = None, **kwargs):
        """Log CloudFlare challenge resolution"""
        message = f"CloudFlare challenge solved: {challenge_type}"
        if duration:
            message += f" in {duration:.2f}s"
        
        self._log_with_context(
            LogLevel.CHALLENGE.value,
            LogCategory.CHALLENGE,
            message,
            domain=domain,
            challenge_type=challenge_type,
            duration=duration,
            **kwargs
        )
    
    def proxy_used(self, proxy_url: str, domain: str, **kwargs):
        """Log proxy usage"""
        self._log_with_context(
            LogLevel.PROXY.value,
            LogCategory.PROXY,
            f"Using proxy: {mask_proxy_credentials(proxy_url)}",
            domain=domain,
            proxy_used=mask_proxy_credentials(proxy_url),
            **kwargs
        )
    
    def cache_hit(self, url: str, domain: str = None, **kwargs):
        """Log cache hit"""
        self._log_with_context(
            LogLevel.CACHE.value,
            LogCategory.CACHE,
            f"Cache hit for {url}",
            url=url,
            domain=domain or extract_domain(url),
            cache_hit=True,
            **kwargs
        )
    
    def cache_miss(self, url: str, domain: str = None, **kwargs):
        """Log cache miss"""
        self._log_with_context(
            LogLevel.CACHE.value,
            LogCategory.CACHE,
            f"Cache miss for {url}",
            url=url,
            domain=domain or extract_domain(url),
            cache_hit=False,
            **kwargs
        )
    
    def session_created(self, domain: str, session_id: str = None, config: Dict[str, Any] = None, **kwargs):
        """Log session creation"""
        message = f"Created new session for {domain}"
        if config:
            browser = config.get('browser', {})
            if browser:
                message += f" (browser: {browser.get('browser', 'unknown')}, platform: {browser.get('platform', 'unknown')})"
        
        self._log_with_context(
            logging.INFO,
            LogCategory.SESSION,
            message,
            domain=domain,
            session_id=session_id,
            **kwargs
        )
    
    def error(self, error: Exception, context: Dict[str, Any] = None, **kwargs):
        """Log error with context"""
        self._log_with_context(
            logging.ERROR,
            LogCategory.ERROR,
            f"Error: {str(error)}",
            extra_data=context or {},
            **kwargs
        )
    
    def set_level(self, level):
        """Set logging level"""
        self.logger.setLevel(level)


# ─────────────────────────────────────────────────────────────
# Enhanced Error Handler
# ─────────────────────────────────────────────────────────────

class EnhancedErrorHandler:
    """Enhanced error handler with classification and recovery strategies"""
    
    def __init__(self):
        self.error_patterns = self._init_error_patterns()
        self.recovery_strategies = self._init_recovery_strategies()
    
    def _init_error_patterns(self) -> Dict[str, Tuple[ErrorCategory, ErrorSeverity]]:
        """Initialize error pattern matching"""
        return {
            # Network errors
            "connection refused": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.HIGH),
            "connection timeout": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            "connection reset": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.MEDIUM),
            "network unreachable": (ErrorCategory.NETWORK_ERROR, ErrorSeverity.HIGH),
            
            # CloudFlare specific
            "just a moment": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "challenge-platform": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "checking your browser": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            "cloudflare": (ErrorCategory.CLOUDFLARE_CHALLENGE, ErrorSeverity.MEDIUM),
            
            # TLS/SSL errors
            "ssl handshake failed": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.HIGH),
            "certificate verify failed": (ErrorCategory.TLS_SSL_ERROR, ErrorSeverity.HIGH),
            
            # Proxy errors
            "proxy connection failed": (ErrorCategory.PROXY_ERROR, ErrorSeverity.HIGH),
            "proxy authentication": (ErrorCategory.PROXY_ERROR, ErrorSeverity.HIGH),
            
            # Timeout errors
            "read timeout": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            "operation timed out": (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
            
            # Cache errors
            "redis connection": (ErrorCategory.CACHE_ERROR, ErrorSeverity.LOW),
            "cache unavailable": (ErrorCategory.CACHE_ERROR, ErrorSeverity.LOW),
        }
    
    def _init_recovery_strategies(self) -> Dict[ErrorCategory, Dict[str, Any]]:
        """Initialize recovery strategies"""
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
        
        # Match error patterns
        category = ErrorCategory.UNKNOWN_ERROR
        severity = ErrorSeverity.MEDIUM
        
        for pattern, (cat, sev) in self.error_patterns.items():
            if pattern in error_message:
                category = cat
                severity = sev
                break
        
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
        logger = logging.getLogger(__name__)
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


# ─────────────────────────────────────────────────────────────
# Global Instances
# ─────────────────────────────────────────────────────────────

enhanced_logger = EnhancedLogger()
error_handler = EnhancedErrorHandler()
