"""
Adaptive Retry Manager for CF Bypass Service
Implements intelligent retry strategies based on domain reliability.

Performance improvements:
- Fast failure for reliable domains (90%+ success rate)
- Moderate retries for medium reliability (70-90% success rate)
- Aggressive retries for unreliable domains (<70% success rate)
- Adaptive backoff multipliers based on reliability
"""
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
from collections import defaultdict
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


@dataclass
class RetryConfig:
    """Retry configuration for a specific reliability tier"""
    max_retries: int
    backoff_factor: float
    status_forcelist: list = None
    allowed_methods: list = None
    
    def __post_init__(self):
        if self.status_forcelist is None:
            self.status_forcelist = [429, 500, 502, 503, 504]
        if self.allowed_methods is None:
            self.allowed_methods = ["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE"]
    
    def to_urllib3_retry(self) -> Retry:
        """Convert to urllib3 Retry object"""
        return Retry(
            total=self.max_retries,
            backoff_factor=self.backoff_factor,
            status_forcelist=self.status_forcelist,
            allowed_methods=self.allowed_methods
        )


class AdaptiveRetryManager:
    """
    Manages adaptive retry strategies based on domain reliability
    
    Retry Tiers:
    - High reliability (>90% success): 2 retries, 1.0x backoff
    - Medium reliability (70-90% success): 3 retries, 1.5x backoff
    - Low reliability (<70% success): 5 retries, 2.0x backoff
    """
    
    def __init__(
        self,
        high_reliability_max: int = 2,
        medium_reliability_max: int = 3,
        low_reliability_max: int = 5,
        high_backoff: float = 1.0,
        medium_backoff: float = 1.5,
        low_backoff: float = 2.0,
        success_rate_high: float = 0.9,
        success_rate_medium: float = 0.7,
        enable_monitoring: bool = True
    ):
        """
        Initialize adaptive retry manager
        
        Args:
            high_reliability_max: Max retries for high reliability domains (default: 2)
            medium_reliability_max: Max retries for medium reliability domains (default: 3)
            low_reliability_max: Max retries for low reliability domains (default: 5)
            high_backoff: Backoff factor for high reliability (default: 1.0)
            medium_backoff: Backoff factor for medium reliability (default: 1.5)
            low_backoff: Backoff factor for low reliability (default: 2.0)
            success_rate_high: Threshold for high reliability (default: 0.9)
            success_rate_medium: Threshold for medium reliability (default: 0.7)
            enable_monitoring: Enable retry statistics monitoring (default: True)
        """
        self.high_reliability_max = high_reliability_max
        self.medium_reliability_max = medium_reliability_max
        self.low_reliability_max = low_reliability_max
        self.high_backoff = high_backoff
        self.medium_backoff = medium_backoff
        self.low_backoff = low_backoff
        self.success_rate_high = success_rate_high
        self.success_rate_medium = success_rate_medium
        self.enable_monitoring = enable_monitoring
        
        # Domain statistics: {domain: {'success': int, 'failure': int, 'last_updated': datetime}}
        self._domain_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'success': 0,
            'failure': 0,
            'last_updated': None
        })
        
        # Retry configurations for each tier
        self._high_config = RetryConfig(
            max_retries=high_reliability_max,
            backoff_factor=high_backoff
        )
        self._medium_config = RetryConfig(
            max_retries=medium_reliability_max,
            backoff_factor=medium_backoff
        )
        self._low_config = RetryConfig(
            max_retries=low_reliability_max,
            backoff_factor=low_backoff
        )
        
        logger.info(
            f"AdaptiveRetryManager initialized: "
            f"high={high_reliability_max}@{high_backoff}x, "
            f"medium={medium_reliability_max}@{medium_backoff}x, "
            f"low={low_reliability_max}@{low_backoff}x"
        )
    
    def record_attempt(self, domain: str, success: bool) -> None:
        """
        Record a request attempt for a domain
        
        Args:
            domain: Domain name
            success: True if request succeeded, False if failed
        """
        if not self.enable_monitoring:
            return
        
        stats = self._domain_stats[domain]
        
        if success:
            stats['success'] += 1
        else:
            stats['failure'] += 1
        
        stats['last_updated'] = datetime.now()
    
    def get_success_rate(self, domain: str) -> float:
        """
        Calculate success rate for a domain
        
        Args:
            domain: Domain name
        
        Returns:
            Success rate (0.0 to 1.0), or 1.0 if no data
        """
        stats = self._domain_stats[domain]
        total = stats['success'] + stats['failure']
        
        if total == 0:
            return 1.0  # Assume high reliability for new domains
        
        return stats['success'] / total
    
    def get_retry_config(self, domain: str) -> RetryConfig:
        """
        Get retry configuration based on domain reliability
        
        Args:
            domain: Domain name
        
        Returns:
            RetryConfig appropriate for domain's reliability tier
        """
        success_rate = self.get_success_rate(domain)
        
        if success_rate >= self.success_rate_high:
            # High reliability: minimal retries
            logger.debug(
                f"Domain {domain} has high reliability ({success_rate:.2%}), "
                f"using {self.high_reliability_max} retries"
            )
            return self._high_config
        elif success_rate >= self.success_rate_medium:
            # Medium reliability: moderate retries
            logger.debug(
                f"Domain {domain} has medium reliability ({success_rate:.2%}), "
                f"using {self.medium_reliability_max} retries"
            )
            return self._medium_config
        else:
            # Low reliability: aggressive retries
            logger.debug(
                f"Domain {domain} has low reliability ({success_rate:.2%}), "
                f"using {self.low_reliability_max} retries"
            )
            return self._low_config
    
    def get_reliability_tier(self, domain: str) -> str:
        """
        Get reliability tier name for a domain
        
        Args:
            domain: Domain name
        
        Returns:
            Tier name: "high", "medium", or "low"
        """
        success_rate = self.get_success_rate(domain)
        
        if success_rate >= self.success_rate_high:
            return "high"
        elif success_rate >= self.success_rate_medium:
            return "medium"
        else:
            return "low"
    
    def get_retry_stats(self, domain: Optional[str] = None) -> Dict[str, Any]:
        """
        Get retry statistics
        
        Args:
            domain: Domain name (None for all domains)
        
        Returns:
            Dictionary with retry statistics
        """
        if domain:
            stats = self._domain_stats[domain]
            success_rate = self.get_success_rate(domain)
            tier = self.get_reliability_tier(domain)
            config = self.get_retry_config(domain)
            
            return {
                'domain': domain,
                'success_count': stats['success'],
                'failure_count': stats['failure'],
                'total_attempts': stats['success'] + stats['failure'],
                'success_rate': success_rate,
                'reliability_tier': tier,
                'max_retries': config.max_retries,
                'backoff_factor': config.backoff_factor,
                'last_updated': stats['last_updated'].isoformat() if stats['last_updated'] else None
            }
        else:
            # Return stats for all domains
            return {
                domain: self.get_retry_stats(domain)
                for domain in self._domain_stats.keys()
            }
    
    def get_configuration(self) -> Dict[str, Any]:
        """
        Get current retry configuration
        
        Returns:
            Dictionary with configuration settings
        """
        return {
            'high_reliability': {
                'max_retries': self.high_reliability_max,
                'backoff_factor': self.high_backoff,
                'threshold': self.success_rate_high
            },
            'medium_reliability': {
                'max_retries': self.medium_reliability_max,
                'backoff_factor': self.medium_backoff,
                'threshold': self.success_rate_medium
            },
            'low_reliability': {
                'max_retries': self.low_reliability_max,
                'backoff_factor': self.low_backoff,
                'threshold': 0.0
            },
            'enable_monitoring': self.enable_monitoring
        }
    
    def format_exhausted_error(self, domain: str, error: str) -> str:
        """
        Format descriptive error message when retries are exhausted
        
        Args:
            domain: Domain name
            error: Original error message
        
        Returns:
            Formatted error message with retry statistics
        """
        stats = self.get_retry_stats(domain)
        
        return (
            f"Retry attempts exhausted for {domain}. "
            f"Reliability: {stats['reliability_tier']} "
            f"({stats['success_rate']:.1%} success rate, "
            f"{stats['total_attempts']} total attempts). "
            f"Max retries: {stats['max_retries']}, "
            f"Backoff: {stats['backoff_factor']}x. "
            f"Original error: {error}"
        )
