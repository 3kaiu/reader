"""
Phase 2 Configuration Management
Handles configuration loading, validation, and feature flags for Phase 2 optimizations.
"""
import os
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


@dataclass
class Phase2Config:
    """
    Configuration for Phase 2 optimizations
    Supports environment variable loading with safe defaults
    """
    
    # Session Pool Configuration
    session_pool_enabled: bool = True
    session_pool_size: int = 5
    session_pool_min_threshold: int = 2
    session_max_age_hours: int = 1
    warmup_domains: List[str] = field(default_factory=list)
    
    # Connection Pool Configuration
    connection_pool_enabled: bool = True
    pool_connections: int = 20
    pool_maxsize: int = 50
    pool_max_retries: int = 3
    pool_backoff_factor: float = 0.3
    
    # Adaptive Retry Configuration
    adaptive_retry_enabled: bool = True
    retry_high_reliability_max: int = 2
    retry_medium_reliability_max: int = 3
    retry_low_reliability_max: int = 5
    retry_high_backoff: float = 1.0
    retry_medium_backoff: float = 1.5
    retry_low_backoff: float = 2.0
    retry_success_rate_high: float = 0.9
    retry_success_rate_medium: float = 0.7
    
    # Memory Management Configuration
    memory_optimization_enabled: bool = True
    streaming_threshold_mb: int = 10
    idle_session_timeout_hours: int = 1
    aggressive_cleanup_threshold: float = 0.8
    cache_size_limit: int = 10000
    cleanup_interval_minutes: int = 5
    
    # Auto-recovery Configuration
    auto_recovery_enabled: bool = True
    degraded_error_rate_threshold: float = 0.5
    slow_response_multiplier: float = 2.0
    
    # Domain-specific overrides
    domain_overrides: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    
    @classmethod
    def from_env(cls) -> 'Phase2Config':
        """
        Load configuration from environment variables
        Falls back to safe defaults if variables are missing or invalid
        """
        config = cls()
        
        # Session Pool
        config.session_pool_enabled = cls._parse_bool(
            os.getenv('PHASE2_SESSION_POOL_ENABLED', 'true'),
            default=True,
            name='PHASE2_SESSION_POOL_ENABLED'
        )
        config.session_pool_size = cls._parse_int(
            os.getenv('PHASE2_SESSION_POOL_SIZE', '5'),
            default=5,
            min_value=1,
            max_value=20,
            name='PHASE2_SESSION_POOL_SIZE'
        )
        config.session_pool_min_threshold = cls._parse_int(
            os.getenv('PHASE2_SESSION_POOL_MIN_THRESHOLD', '2'),
            default=2,
            min_value=1,
            max_value=config.session_pool_size,
            name='PHASE2_SESSION_POOL_MIN_THRESHOLD'
        )
        config.session_max_age_hours = cls._parse_int(
            os.getenv('PHASE2_SESSION_MAX_AGE_HOURS', '1'),
            default=1,
            min_value=1,
            max_value=24,
            name='PHASE2_SESSION_MAX_AGE_HOURS'
        )
        
        # Warmup domains (comma-separated)
        warmup_domains_str = os.getenv('PHASE2_WARMUP_DOMAINS', '')
        if warmup_domains_str:
            config.warmup_domains = [d.strip() for d in warmup_domains_str.split(',') if d.strip()]
        
        # Connection Pool
        config.connection_pool_enabled = cls._parse_bool(
            os.getenv('PHASE2_CONNECTION_POOL_ENABLED', 'true'),
            default=True,
            name='PHASE2_CONNECTION_POOL_ENABLED'
        )
        config.pool_connections = cls._parse_int(
            os.getenv('PHASE2_POOL_CONNECTIONS', '20'),
            default=20,
            min_value=1,
            max_value=100,
            name='PHASE2_POOL_CONNECTIONS'
        )
        config.pool_maxsize = cls._parse_int(
            os.getenv('PHASE2_POOL_MAXSIZE', '50'),
            default=50,
            min_value=1,
            max_value=200,
            name='PHASE2_POOL_MAXSIZE'
        )
        config.pool_max_retries = cls._parse_int(
            os.getenv('PHASE2_POOL_MAX_RETRIES', '3'),
            default=3,
            min_value=0,
            max_value=10,
            name='PHASE2_POOL_MAX_RETRIES'
        )
        config.pool_backoff_factor = cls._parse_float(
            os.getenv('PHASE2_POOL_BACKOFF_FACTOR', '0.3'),
            default=0.3,
            min_value=0.0,
            max_value=5.0,
            name='PHASE2_POOL_BACKOFF_FACTOR'
        )
        
        # Adaptive Retry
        config.adaptive_retry_enabled = cls._parse_bool(
            os.getenv('PHASE2_ADAPTIVE_RETRY_ENABLED', 'true'),
            default=True,
            name='PHASE2_ADAPTIVE_RETRY_ENABLED'
        )
        config.retry_high_reliability_max = cls._parse_int(
            os.getenv('PHASE2_RETRY_HIGH_MAX', '2'),
            default=2,
            min_value=0,
            max_value=10,
            name='PHASE2_RETRY_HIGH_MAX'
        )
        config.retry_medium_reliability_max = cls._parse_int(
            os.getenv('PHASE2_RETRY_MEDIUM_MAX', '3'),
            default=3,
            min_value=0,
            max_value=10,
            name='PHASE2_RETRY_MEDIUM_MAX'
        )
        config.retry_low_reliability_max = cls._parse_int(
            os.getenv('PHASE2_RETRY_LOW_MAX', '5'),
            default=5,
            min_value=0,
            max_value=10,
            name='PHASE2_RETRY_LOW_MAX'
        )
        
        # Memory Management
        config.memory_optimization_enabled = cls._parse_bool(
            os.getenv('PHASE2_MEMORY_OPTIMIZATION_ENABLED', 'true'),
            default=True,
            name='PHASE2_MEMORY_OPTIMIZATION_ENABLED'
        )
        config.streaming_threshold_mb = cls._parse_int(
            os.getenv('PHASE2_STREAMING_THRESHOLD_MB', '10'),
            default=10,
            min_value=1,
            max_value=100,
            name='PHASE2_STREAMING_THRESHOLD_MB'
        )
        config.idle_session_timeout_hours = cls._parse_int(
            os.getenv('PHASE2_IDLE_SESSION_TIMEOUT_HOURS', '1'),
            default=1,
            min_value=1,
            max_value=24,
            name='PHASE2_IDLE_SESSION_TIMEOUT_HOURS'
        )
        config.aggressive_cleanup_threshold = cls._parse_float(
            os.getenv('PHASE2_AGGRESSIVE_CLEANUP_THRESHOLD', '0.8'),
            default=0.8,
            min_value=0.5,
            max_value=0.95,
            name='PHASE2_AGGRESSIVE_CLEANUP_THRESHOLD'
        )
        
        # Auto-recovery
        config.auto_recovery_enabled = cls._parse_bool(
            os.getenv('PHASE2_AUTO_RECOVERY_ENABLED', 'true'),
            default=True,
            name='PHASE2_AUTO_RECOVERY_ENABLED'
        )
        config.degraded_error_rate_threshold = cls._parse_float(
            os.getenv('PHASE2_DEGRADED_ERROR_RATE', '0.5'),
            default=0.5,
            min_value=0.1,
            max_value=0.9,
            name='PHASE2_DEGRADED_ERROR_RATE'
        )
        
        logger.info("Phase 2 configuration loaded from environment")
        return config
    
    @staticmethod
    def _parse_bool(value: str, default: bool, name: str) -> bool:
        """Parse boolean from string with validation"""
        try:
            return value.lower() in ('true', '1', 'yes', 'on')
        except Exception as e:
            logger.warning(
                f"Invalid boolean value for {name}: '{value}'. "
                f"Using default: {default}. Error: {e}"
            )
            return default
    
    @staticmethod
    def _parse_int(
        value: str,
        default: int,
        min_value: Optional[int] = None,
        max_value: Optional[int] = None,
        name: str = ''
    ) -> int:
        """Parse integer from string with validation"""
        try:
            parsed = int(value)
            
            # Validate range
            if min_value is not None and parsed < min_value:
                logger.warning(
                    f"Value for {name} ({parsed}) is below minimum ({min_value}). "
                    f"Using minimum value."
                )
                return min_value
            
            if max_value is not None and parsed > max_value:
                logger.warning(
                    f"Value for {name} ({parsed}) exceeds maximum ({max_value}). "
                    f"Using maximum value."
                )
                return max_value
            
            return parsed
        except Exception as e:
            logger.warning(
                f"Invalid integer value for {name}: '{value}'. "
                f"Using default: {default}. Error: {e}"
            )
            return default
    
    @staticmethod
    def _parse_float(
        value: str,
        default: float,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
        name: str = ''
    ) -> float:
        """Parse float from string with validation"""
        try:
            parsed = float(value)
            
            # Validate range
            if min_value is not None and parsed < min_value:
                logger.warning(
                    f"Value for {name} ({parsed}) is below minimum ({min_value}). "
                    f"Using minimum value."
                )
                return min_value
            
            if max_value is not None and parsed > max_value:
                logger.warning(
                    f"Value for {name} ({parsed}) exceeds maximum ({max_value}). "
                    f"Using maximum value."
                )
                return max_value
            
            return parsed
        except Exception as e:
            logger.warning(
                f"Invalid float value for {name}: '{value}'. "
                f"Using default: {default}. Error: {e}"
            )
            return default
    
    def get_domain_config(self, domain: str, key: str, default: Any = None) -> Any:
        """
        Get domain-specific configuration value
        Falls back to global config if domain override not found
        """
        if domain in self.domain_overrides:
            return self.domain_overrides[domain].get(key, default)
        return default
    
    def validate(self) -> List[str]:
        """
        Validate configuration and return list of warnings
        """
        warnings = []
        
        # Validate session pool
        if self.session_pool_min_threshold > self.session_pool_size:
            warnings.append(
                f"session_pool_min_threshold ({self.session_pool_min_threshold}) "
                f"exceeds session_pool_size ({self.session_pool_size})"
            )
        
        # Validate connection pool
        if self.pool_connections > self.pool_maxsize:
            warnings.append(
                f"pool_connections ({self.pool_connections}) "
                f"exceeds pool_maxsize ({self.pool_maxsize})"
            )
        
        # Validate retry tiers
        if not (self.retry_high_reliability_max <= self.retry_medium_reliability_max <= self.retry_low_reliability_max):
            warnings.append(
                "Retry max values should be: high <= medium <= low. "
                f"Current: high={self.retry_high_reliability_max}, "
                f"medium={self.retry_medium_reliability_max}, "
                f"low={self.retry_low_reliability_max}"
            )
        
        # Validate success rate thresholds
        if self.retry_success_rate_medium >= self.retry_success_rate_high:
            warnings.append(
                f"retry_success_rate_medium ({self.retry_success_rate_medium}) "
                f"should be less than retry_success_rate_high ({self.retry_success_rate_high})"
            )
        
        return warnings
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary for API responses"""
        return {
            'session_pool': {
                'enabled': self.session_pool_enabled,
                'pool_size': self.session_pool_size,
                'min_threshold': self.session_pool_min_threshold,
                'max_age_hours': self.session_max_age_hours,
                'warmup_domains': self.warmup_domains
            },
            'connection_pool': {
                'enabled': self.connection_pool_enabled,
                'pool_connections': self.pool_connections,
                'pool_maxsize': self.pool_maxsize,
                'max_retries': self.pool_max_retries,
                'backoff_factor': self.pool_backoff_factor
            },
            'adaptive_retry': {
                'enabled': self.adaptive_retry_enabled,
                'high_reliability_max': self.retry_high_reliability_max,
                'medium_reliability_max': self.retry_medium_reliability_max,
                'low_reliability_max': self.retry_low_reliability_max,
                'success_rate_thresholds': {
                    'high': self.retry_success_rate_high,
                    'medium': self.retry_success_rate_medium
                }
            },
            'memory_optimization': {
                'enabled': self.memory_optimization_enabled,
                'streaming_threshold_mb': self.streaming_threshold_mb,
                'idle_session_timeout_hours': self.idle_session_timeout_hours,
                'aggressive_cleanup_threshold': self.aggressive_cleanup_threshold,
                'cache_size_limit': self.cache_size_limit
            },
            'auto_recovery': {
                'enabled': self.auto_recovery_enabled,
                'degraded_error_rate_threshold': self.degraded_error_rate_threshold,
                'slow_response_multiplier': self.slow_response_multiplier
            }
        }


# Global configuration instance
phase2_config = Phase2Config.from_env()

# Validate configuration on load
validation_warnings = phase2_config.validate()
if validation_warnings:
    logger.warning("Phase 2 configuration validation warnings:")
    for warning in validation_warnings:
        logger.warning(f"  - {warning}")
