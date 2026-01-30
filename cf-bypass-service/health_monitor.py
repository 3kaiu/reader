"""
Enhanced Health Monitor for CF Bypass Service
Implements health monitoring and auto-recovery for degraded domains.

Features:
- Per-domain performance metrics tracking
- Degradation detection (error rate >50%)
- Slow response detection (200% increase)
- Automatic session reset for degraded domains
- Health status reporting
"""
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
from collections import defaultdict, deque

logger = logging.getLogger(__name__)


@dataclass
class DomainHealth:
    """Health status for a domain"""
    domain: str
    status: str  # "healthy", "degraded", "critical"
    error_rate: float
    avg_response_time: float
    baseline_response_time: float
    total_requests: int
    last_check: datetime
    
    @property
    def is_degraded(self) -> bool:
        """Check if domain is degraded"""
        return self.status in ["degraded", "critical"]
    
    @property
    def response_time_increase(self) -> float:
        """Calculate response time increase percentage"""
        if self.baseline_response_time == 0:
            return 0.0
        return (self.avg_response_time - self.baseline_response_time) / self.baseline_response_time


class EnhancedHealthMonitor:
    """
    Enhanced health monitoring with auto-recovery
    
    Features:
    - Track per-domain performance metrics
    - Detect degraded domains (error rate >50%)
    - Detect slow responses (200% increase)
    - Automatic recovery actions
    """
    
    def __init__(
        self,
        degraded_error_rate_threshold: float = 0.5,
        slow_response_multiplier: float = 2.0,
        baseline_window_size: int = 100,
        enable_auto_recovery: bool = True
    ):
        """
        Initialize enhanced health monitor
        
        Args:
            degraded_error_rate_threshold: Error rate threshold for degradation (default: 0.5)
            slow_response_multiplier: Response time multiplier for slow detection (default: 2.0)
            baseline_window_size: Number of requests for baseline calculation (default: 100)
            enable_auto_recovery: Enable automatic recovery (default: True)
        """
        self.degraded_error_rate_threshold = degraded_error_rate_threshold
        self.slow_response_multiplier = slow_response_multiplier
        self.baseline_window_size = baseline_window_size
        self.enable_auto_recovery = enable_auto_recovery
        
        # Domain statistics
        self._domain_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'success_count': 0,
            'error_count': 0,
            'total_time': 0.0,
            'last_success': None,
            'errors': defaultdict(int),
            'response_times': deque(maxlen=baseline_window_size),
            'baseline_response_time': 0.0,
            'status': 'healthy',
            'last_recovery': None,
            'recovery_count': 0
        })
        
        logger.info(
            f"EnhancedHealthMonitor initialized: "
            f"degraded_threshold={degraded_error_rate_threshold}, "
            f"slow_multiplier={slow_response_multiplier}x"
        )
    
    def record_success(self, domain: str, duration: float) -> None:
        """
        Record successful request
        
        Args:
            domain: Domain name
            duration: Request duration in seconds
        """
        stats = self._domain_stats[domain]
        stats['success_count'] += 1
        stats['total_time'] += duration
        stats['last_success'] = datetime.now()
        stats['response_times'].append(duration)
        
        # Update baseline only when we first fill the window
        # After that, baseline represents the initial "healthy" performance
        if len(stats['response_times']) == self.baseline_window_size and stats['baseline_response_time'] == 0.0:
            stats['baseline_response_time'] = sum(stats['response_times']) / len(stats['response_times'])
            logger.info(f"Established baseline for {domain}: {stats['baseline_response_time']:.2f}s")
    
    def record_error(self, domain: str, error: str) -> None:
        """
        Record error
        
        Args:
            domain: Domain name
            error: Error message
        """
        stats = self._domain_stats[domain]
        stats['error_count'] += 1
        stats['errors'][error] += 1
    
    def get_error_rate(self, domain: str) -> float:
        """
        Calculate error rate for a domain
        
        Args:
            domain: Domain name
        
        Returns:
            Error rate (0.0 to 1.0)
        """
        stats = self._domain_stats[domain]
        total = stats['success_count'] + stats['error_count']
        
        if total == 0:
            return 0.0
        
        return stats['error_count'] / total
    
    def get_avg_response_time(self, domain: str) -> float:
        """
        Calculate average response time for a domain
        
        Args:
            domain: Domain name
        
        Returns:
            Average response time in seconds
        """
        stats = self._domain_stats[domain]
        
        if stats['success_count'] == 0:
            return 0.0
        
        return stats['total_time'] / stats['success_count']
    
    def get_recent_avg_response_time(self, domain: str) -> float:
        """
        Calculate recent average response time (from response_times deque)
        
        Args:
            domain: Domain name
        
        Returns:
            Recent average response time in seconds
        """
        stats = self._domain_stats[domain]
        
        if not stats['response_times']:
            return 0.0
        
        return sum(stats['response_times']) / len(stats['response_times'])
    
    def check_domain_health(self, domain: str) -> DomainHealth:
        """
        Check health status of a domain
        
        Args:
            domain: Domain name
        
        Returns:
            DomainHealth object with current status
        """
        stats = self._domain_stats[domain]
        error_rate = self.get_error_rate(domain)
        avg_response_time = self.get_avg_response_time(domain)
        baseline_response_time = stats['baseline_response_time']
        
        # Determine status
        status = 'healthy'
        
        # Check for degradation (error rate >50%)
        if error_rate > self.degraded_error_rate_threshold:
            status = 'degraded'
            logger.warning(
                f"Domain {domain} is degraded: error rate {error_rate:.1%} "
                f"exceeds threshold {self.degraded_error_rate_threshold:.1%}"
            )
        
        # Check for slow responses (200% increase)
        # Compare recent average to baseline to detect sudden slowdowns
        # Only check if we have established a baseline
        if baseline_response_time > 0 and len(stats['response_times']) >= self.baseline_window_size:
            recent_avg = self.get_recent_avg_response_time(domain)
            
            # Calculate baseline from older requests (not including most recent ones)
            # Use the stored baseline which represents historical performance
            response_time_increase = (recent_avg - baseline_response_time) / baseline_response_time
            
            if response_time_increase > (self.slow_response_multiplier - 1.0):
                if status == 'degraded':
                    status = 'critical'
                else:
                    status = 'degraded'
                logger.warning(
                    f"Domain {domain} has slow responses: "
                    f"recent {recent_avg:.2f}s vs baseline {baseline_response_time:.2f}s "
                    f"({response_time_increase:.1%} increase)"
                )
        
        # Update status
        stats['status'] = status
        
        total_requests = stats['success_count'] + stats['error_count']
        
        return DomainHealth(
            domain=domain,
            status=status,
            error_rate=error_rate,
            avg_response_time=avg_response_time,
            baseline_response_time=baseline_response_time,
            total_requests=total_requests,
            last_check=datetime.now()
        )
    
    async def trigger_recovery(self, domain: str, recovery_func: callable) -> bool:
        """
        Trigger recovery for a degraded domain
        
        Args:
            domain: Domain name
            recovery_func: Function to call for recovery (takes domain as parameter)
        
        Returns:
            True if recovery was triggered
        """
        if not self.enable_auto_recovery:
            return False
        
        health = self.check_domain_health(domain)
        
        if not health.is_degraded:
            return False
        
        logger.warning(f"Triggering recovery for degraded domain: {domain}")
        
        try:
            # Check if recovery_func is a coroutine
            import inspect
            if inspect.iscoroutinefunction(recovery_func):
                await recovery_func(domain)
            else:
                recovery_func(domain)
            
            stats = self._domain_stats[domain]
            stats['last_recovery'] = datetime.now()
            stats['recovery_count'] += 1
            
            logger.info(f"Recovery completed for {domain} (count: {stats['recovery_count']})")
            return True
            
        except Exception as e:
            logger.error(f"Recovery failed for {domain}: {e}")
            return False
    
    def get_health_stats(self, domain: Optional[str] = None) -> Dict[str, Any]:
        """
        Get health statistics
        
        Args:
            domain: Domain name (None for all domains)
        
        Returns:
            Dictionary with health statistics
        """
        if domain:
            stats = self._domain_stats[domain]
            health = self.check_domain_health(domain)
            
            return {
                'domain': domain,
                'status': health.status,
                'error_rate': health.error_rate,
                'avg_response_time': health.avg_response_time,
                'baseline_response_time': health.baseline_response_time,
                'response_time_increase': health.response_time_increase,
                'total_requests': health.total_requests,
                'success_count': stats['success_count'],
                'error_count': stats['error_count'],
                'last_success': stats['last_success'].isoformat() if stats['last_success'] else None,
                'last_recovery': stats['last_recovery'].isoformat() if stats['last_recovery'] else None,
                'recovery_count': stats['recovery_count'],
                'top_errors': dict(list(stats['errors'].items())[:5])
            }
        else:
            # Return stats for all domains
            return {
                domain: self.get_health_stats(domain)
                for domain in self._domain_stats.keys()
            }
    
    def get_degraded_domains(self) -> list[str]:
        """
        Get list of degraded domains
        
        Returns:
            List of degraded domain names
        """
        degraded = []
        
        for domain in self._domain_stats.keys():
            health = self.check_domain_health(domain)
            if health.is_degraded:
                degraded.append(domain)
        
        return degraded
    
    def reset_domain_stats(self, domain: str) -> None:
        """
        Reset statistics for a domain (useful after recovery)
        
        Args:
            domain: Domain name
        """
        if domain in self._domain_stats:
            stats = self._domain_stats[domain]
            # Keep recovery history but reset performance stats
            stats['success_count'] = 0
            stats['error_count'] = 0
            stats['total_time'] = 0.0
            stats['errors'].clear()
            stats['response_times'].clear()
            stats['status'] = 'healthy'
            
            logger.info(f"Reset statistics for domain: {domain}")
