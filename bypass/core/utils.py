"""
Core Utilities for CF Bypass Service
Consolidated logging and error handling for high cohesion.
"""
import logging
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum

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


class ScraperLogFormatter(logging.Formatter):
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
    """Enhanced logger with scraper-specific functionality"""
    
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
            handler.setFormatter(ScraperLogFormatter(use_json=use_json))
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
# Global Instances
# ─────────────────────────────────────────────────────────────

enhanced_logger = EnhancedLogger()
