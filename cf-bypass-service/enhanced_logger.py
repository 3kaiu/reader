"""
Enhanced Logging System for CF Bypass Service
Provides CloudScraper-specific logging with challenge tracking and proxy monitoring.
"""
import logging
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum
from dataclasses import dataclass, asdict

class LogLevel(Enum):
    """Custom log levels for CF Bypass Service"""
    CHALLENGE = 25  # Between INFO and WARNING
    PROXY = 22      # Between INFO and WARNING
    CACHE = 15      # Between DEBUG and INFO

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

@dataclass
class LogEntry:
    """Structured log entry"""
    timestamp: datetime
    level: str
    category: LogCategory
    message: str
    domain: Optional[str] = None
    url: Optional[str] = None
    duration: Optional[float] = None
    status_code: Optional[int] = None
    challenge_type: Optional[str] = None
    proxy_used: Optional[str] = None
    cache_hit: Optional[bool] = None
    session_id: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON logging"""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        data['category'] = self.category.value
        return {k: v for k, v in data.items() if v is not None}

class CloudScraperFormatter(logging.Formatter):
    """Custom formatter for CloudScraper logs"""
    
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
        # Sanitize message and any extra attributes to prevent log injection
        if hasattr(record, 'msg') and isinstance(record.msg, str):
            record.msg = self._sanitize_str(record.msg)
            
        for attr in ['url', 'domain', 'challenge_type', 'proxy_used', 'session_id']:
            if hasattr(record, attr) and isinstance(getattr(record, attr), str):
                setattr(record, attr, self._sanitize_str(getattr(record, attr)))

        if self.use_json:
            return self._format_json(record)
        else:
            return self._format_text(record)

    def _sanitize_str(self, s: str) -> str:
        """Escape CRLF characters to prevent log injection"""
        return s.replace('\r', '\\r').replace('\n', '\\n')
    
    def _format_json(self, record) -> str:
        """Format log record as JSON"""
        log_data = {
            'timestamp': datetime.fromtimestamp(record.created).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'category': getattr(record, 'category', 'general')
        }
        
        # Add extra fields if present
        for field in ['domain', 'url', 'duration', 'status_code', 'challenge_type', 
                     'proxy_used', 'cache_hit', 'session_id']:
            if hasattr(record, field):
                log_data[field] = getattr(record, field)
        
        if hasattr(record, 'extra_data') and record.extra_data:
            log_data.update(record.extra_data)
        
        return json.dumps(log_data)
    
    def _format_text(self, record) -> str:
        """Format log record as human-readable text"""
        # Set category for text formatting
        if not hasattr(record, 'category'):
            record.category = 'general'
        
        base_message = super().format(record)
        
        # Add extra context for specific categories
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
        
        # Set up formatter
        formatter = CloudScraperFormatter(use_json=use_json)
        
        # Set up handler if not already configured
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def _log_with_context(self, level: int, category: LogCategory, message: str, **kwargs):
        """Log with structured context"""
        # Sanitize message
        sanitized_message = message.replace('\r', '\\r').replace('\n', '\\n')
        
        extra = {'category': category.value}
        for k, v in kwargs.items():
            if isinstance(v, str):
                extra[k] = v.replace('\r', '\\r').replace('\n', '\\n')
            else:
                extra[k] = v
        self.logger.log(level, sanitized_message, extra=extra)
    
    def request_start(self, url: str, method: str = "GET", domain: str = None, **kwargs):
        """Log request start"""
        self._log_with_context(
            logging.INFO, 
            LogCategory.REQUEST,
            f"Starting {method} request to {url}",
            url=url,
            domain=domain or self._extract_domain(url),
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
            domain=domain or self._extract_domain(url),
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
    
    def challenge_failed(self, challenge_type: str, domain: str, error: str = None, **kwargs):
        """Log CloudFlare challenge failure"""
        message = f"CloudFlare challenge failed: {challenge_type}"
        if error:
            message += f" - {error}"
        
        self._log_with_context(
            logging.WARNING,
            LogCategory.CHALLENGE,
            message,
            domain=domain,
            challenge_type=challenge_type,
            **kwargs
        )
    
    def proxy_used(self, proxy_url: str, domain: str, **kwargs):
        """Log proxy usage"""
        self._log_with_context(
            LogLevel.PROXY.value,
            LogCategory.PROXY,
            f"Using proxy: {self._mask_proxy_credentials(proxy_url)}",
            domain=domain,
            proxy_used=self._mask_proxy_credentials(proxy_url),
            **kwargs
        )
    
    def proxy_failed(self, proxy_url: str, domain: str, error: str = None, **kwargs):
        """Log proxy failure"""
        message = f"Proxy failed: {self._mask_proxy_credentials(proxy_url)}"
        if error:
            message += f" - {error}"
        
        self._log_with_context(
            logging.WARNING,
            LogCategory.PROXY,
            message,
            domain=domain,
            proxy_used=self._mask_proxy_credentials(proxy_url),
            **kwargs
        )
    
    def proxy_rotated(self, old_proxy: str, new_proxy: str, domain: str, **kwargs):
        """Log proxy rotation"""
        self._log_with_context(
            LogLevel.PROXY.value,
            LogCategory.PROXY,
            f"Rotated proxy: {self._mask_proxy_credentials(old_proxy)} -> {self._mask_proxy_credentials(new_proxy)}",
            domain=domain,
            **kwargs
        )
    
    def cache_hit(self, url: str, domain: str = None, **kwargs):
        """Log cache hit"""
        self._log_with_context(
            LogLevel.CACHE.value,
            LogCategory.CACHE,
            f"Cache hit for {url}",
            url=url,
            domain=domain or self._extract_domain(url),
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
            domain=domain or self._extract_domain(url),
            cache_hit=False,
            **kwargs
        )
    
    def cache_error(self, error: str, operation: str = "unknown", **kwargs):
        """Log cache error"""
        self._log_with_context(
            logging.WARNING,
            LogCategory.CACHE,
            f"Cache error during {operation}: {error}",
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
    
    def session_reset(self, domain: str, reason: str, session_id: str = None, **kwargs):
        """Log session reset"""
        self._log_with_context(
            logging.INFO,
            LogCategory.SESSION,
            f"Reset session for {domain}: {reason}",
            domain=domain,
            session_id=session_id,
            **kwargs
        )
    
    def config_loaded(self, config_file: str, domain_count: int, **kwargs):
        """Log configuration loading"""
        self._log_with_context(
            logging.INFO,
            LogCategory.CONFIG,
            f"Loaded configuration from {config_file} ({domain_count} domains)",
            **kwargs
        )
    
    def config_error(self, error: str, domain: str = None, **kwargs):
        """Log configuration error"""
        message = f"Configuration error: {error}"
        if domain:
            message += f" (domain: {domain})"
        
        self._log_with_context(
            logging.ERROR,
            LogCategory.CONFIG,
            message,
            domain=domain,
            **kwargs
        )
    
    def performance_metric(self, metric_name: str, value: float, unit: str = "", **kwargs):
        """Log performance metric"""
        message = f"Performance metric - {metric_name}: {value}"
        if unit:
            message += f" {unit}"
        
        self._log_with_context(
            logging.INFO,
            LogCategory.PERFORMANCE,
            message,
            **kwargs
        )
    
    def error(self, error: Exception, context: Dict[str, Any] = None, **kwargs):
        """Log error with context"""
        message = f"Error: {str(error)}"
        extra_data = context or {}
        
        self._log_with_context(
            logging.ERROR,
            LogCategory.ERROR,
            message,
            extra_data=extra_data,
            **kwargs
        )
    
    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL"""
        try:
            from urllib.parse import urlparse
            return urlparse(url).netloc
        except Exception:
            return "unknown"
    
    def _mask_proxy_credentials(self, proxy_url: str) -> str:
        """Mask credentials in proxy URL for logging"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(proxy_url)
            if parsed.username:
                # Replace credentials with masked version
                masked_netloc = f"{parsed.username[:2]}***@{parsed.hostname}"
                if parsed.port:
                    masked_netloc += f":{parsed.port}"
                return f"{parsed.scheme}://{masked_netloc}"
            return proxy_url
        except Exception:
            return proxy_url
    
    def set_level(self, level):
        """Set logging level"""
        self.logger.setLevel(level)
    
    def add_file_handler(self, filename: str, level=logging.INFO):
        """Add file handler for logging"""
        file_handler = logging.FileHandler(filename)
        file_handler.setLevel(level)
        file_handler.setFormatter(CloudScraperFormatter(use_json=self.use_json))
        self.logger.addHandler(file_handler)

# Global enhanced logger instance
enhanced_logger = EnhancedLogger()

# Convenience functions for common logging operations
def log_request_start(url: str, method: str = "GET", **kwargs):
    """Log request start"""
    enhanced_logger.request_start(url, method, **kwargs)

def log_request_complete(url: str, status_code: int, duration: float, **kwargs):
    """Log request completion"""
    enhanced_logger.request_complete(url, status_code, duration, **kwargs)

def log_challenge_detected(challenge_type: str, domain: str, **kwargs):
    """Log challenge detection"""
    enhanced_logger.challenge_detected(challenge_type, domain, **kwargs)

def log_challenge_solved(challenge_type: str, domain: str, duration: float = None, **kwargs):
    """Log challenge resolution"""
    enhanced_logger.challenge_solved(challenge_type, domain, duration, **kwargs)

def log_proxy_used(proxy_url: str, domain: str, **kwargs):
    """Log proxy usage"""
    enhanced_logger.proxy_used(proxy_url, domain, **kwargs)

def log_cache_hit(url: str, **kwargs):
    """Log cache hit"""
    enhanced_logger.cache_hit(url, **kwargs)

def log_cache_miss(url: str, **kwargs):
    """Log cache miss"""
    enhanced_logger.cache_miss(url, **kwargs)