"""
Configuration Validator for CF Bypass Service
Validates CloudScraper configurations, proxy lists, and browser settings.
"""
import re
import logging
from typing import Dict, List, Tuple, Any, Optional
from urllib.parse import urlparse
import ipaddress

logger = logging.getLogger(__name__)

class ConfigValidator:
    """Validates various configuration parameters"""
    
    # Valid configuration values
    VALID_BROWSERS = ["chrome", "firefox", "safari", "edge", "opera"]
    VALID_PLATFORMS = ["windows", "linux", "darwin", "android", "ios"]
    VALID_INTERPRETERS = ["js2py", "nodejs", "v8"]
    VALID_PROXY_SCHEMES = ["http", "https", "socks4", "socks5"]
    VALID_ROTATION_STRATEGIES = ["sequential", "random", "smart"]
    
    # Reasonable limits
    MAX_DELAY = 60.0  # seconds
    MIN_DELAY = 0.1   # seconds
    MAX_TIMEOUT = 300  # seconds
    MIN_TIMEOUT = 5    # seconds
    MAX_BAN_TIME = 3600  # seconds
    
    @classmethod
    def validate_browser_config(cls, browser_config: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate browser configuration"""
        errors = []
        
        # Check required fields
        if "browser" not in browser_config:
            errors.append("Missing required field: browser")
        elif browser_config["browser"] not in cls.VALID_BROWSERS:
            errors.append(f"Invalid browser: {browser_config['browser']}. Must be one of {cls.VALID_BROWSERS}")
        
        if "platform" not in browser_config:
            errors.append("Missing required field: platform")
        elif browser_config["platform"] not in cls.VALID_PLATFORMS:
            errors.append(f"Invalid platform: {browser_config['platform']}. Must be one of {cls.VALID_PLATFORMS}")
        
        # Check for invalid combinations
        browser = browser_config.get("browser", "")
        platform = browser_config.get("platform", "")
        
        if browser == "safari" and platform not in ["darwin", "ios"]:
            errors.append("Safari browser is only available on darwin (macOS) and ios platforms")
        
        if browser == "edge" and platform not in ["windows", "android"]:
            errors.append("Edge browser is primarily available on windows and android platforms")
        
        return len(errors) == 0, errors
    
    @classmethod
    def validate_stealth_config(cls, stealth_config: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate stealth mode configuration"""
        errors = []
        
        # Validate delays
        min_delay = stealth_config.get("min_delay", 1.0)
        max_delay = stealth_config.get("max_delay", 3.0)
        
        if not isinstance(min_delay, (int, float)) or min_delay < cls.MIN_DELAY:
            errors.append(f"min_delay must be a number >= {cls.MIN_DELAY}")
        elif min_delay > cls.MAX_DELAY:
            errors.append(f"min_delay must be <= {cls.MAX_DELAY}")
        
        if not isinstance(max_delay, (int, float)) or max_delay < cls.MIN_DELAY:
            errors.append(f"max_delay must be a number >= {cls.MIN_DELAY}")
        elif max_delay > cls.MAX_DELAY:
            errors.append(f"max_delay must be <= {cls.MAX_DELAY}")
        
        if isinstance(min_delay, (int, float)) and isinstance(max_delay, (int, float)):
            if min_delay > max_delay:
                errors.append("min_delay must be <= max_delay")
        
        # Validate boolean flags
        for flag in ["human_like_delays", "randomize_headers"]:
            if flag in stealth_config and not isinstance(stealth_config[flag], bool):
                errors.append(f"{flag} must be a boolean value")
        
        return len(errors) == 0, errors
    
    @classmethod
    def validate_proxy_url(cls, proxy_url: str) -> Tuple[bool, str]:
        """Validate a single proxy URL"""
        if not proxy_url or not isinstance(proxy_url, str):
            return False, "Proxy URL must be a non-empty string"
        
        try:
            parsed = urlparse(proxy_url)
            
            # Check scheme
            if parsed.scheme not in cls.VALID_PROXY_SCHEMES:
                return False, f"Invalid proxy scheme: {parsed.scheme}. Must be one of {cls.VALID_PROXY_SCHEMES}"
            
            # Check hostname
            if not parsed.hostname:
                return False, "Proxy URL must include a hostname"
            
            # Validate hostname (IP or domain)
            hostname = parsed.hostname
            try:
                # Try to parse as IP address
                ipaddress.ip_address(hostname)
            except ValueError:
                # Not an IP, validate as domain name
                if not cls._is_valid_domain(hostname):
                    return False, f"Invalid hostname: {hostname}"
            
            # Check port
            if parsed.port is not None:
                if not (1 <= parsed.port <= 65535):
                    return False, f"Invalid port: {parsed.port}. Must be between 1 and 65535"
            
            return True, ""
            
        except Exception as e:
            return False, f"Invalid proxy URL format: {str(e)}"
    
    @classmethod
    def validate_proxy_config(cls, proxy_config: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate proxy configuration"""
        errors = []
        
        # Validate rotation strategy
        rotation_strategy = proxy_config.get("rotation_strategy", "smart")
        if rotation_strategy not in cls.VALID_ROTATION_STRATEGIES:
            errors.append(f"Invalid rotation_strategy: {rotation_strategy}. Must be one of {cls.VALID_ROTATION_STRATEGIES}")
        
        # Validate ban time
        ban_time = proxy_config.get("ban_time", 300)
        if not isinstance(ban_time, int) or ban_time < 0:
            errors.append("ban_time must be a non-negative integer")
        elif ban_time > cls.MAX_BAN_TIME:
            errors.append(f"ban_time must be <= {cls.MAX_BAN_TIME}")
        
        # Validate proxy list
        proxies = proxy_config.get("proxies", [])
        if not isinstance(proxies, list):
            errors.append("proxies must be a list")
        else:
            for i, proxy in enumerate(proxies):
                is_valid, error = cls.validate_proxy_url(proxy)
                if not is_valid:
                    errors.append(f"Proxy {i+1}: {error}")
        
        return len(errors) == 0, errors
    
    @classmethod
    def validate_domain_config(cls, domain_config: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate complete domain configuration"""
        errors = []
        
        # Validate interpreter
        interpreter = domain_config.get("interpreter", "js2py")
        if interpreter not in cls.VALID_INTERPRETERS:
            errors.append(f"Invalid interpreter: {interpreter}. Must be one of {cls.VALID_INTERPRETERS}")
        
        # Validate timeout
        timeout = domain_config.get("timeout", 30)
        if not isinstance(timeout, int) or timeout < cls.MIN_TIMEOUT:
            errors.append(f"timeout must be an integer >= {cls.MIN_TIMEOUT}")
        elif timeout > cls.MAX_TIMEOUT:
            errors.append(f"timeout must be <= {cls.MAX_TIMEOUT}")
        
        # Validate enabled flag
        enabled = domain_config.get("enabled", True)
        if not isinstance(enabled, bool):
            errors.append("enabled must be a boolean value")
        
        # Validate sub-configurations
        if "browser" in domain_config:
            is_valid, browser_errors = cls.validate_browser_config(domain_config["browser"])
            if not is_valid:
                errors.extend([f"Browser config: {error}" for error in browser_errors])
        
        if "stealth" in domain_config:
            is_valid, stealth_errors = cls.validate_stealth_config(domain_config["stealth"])
            if not is_valid:
                errors.extend([f"Stealth config: {error}" for error in stealth_errors])
        
        if "proxy" in domain_config:
            is_valid, proxy_errors = cls.validate_proxy_config(domain_config["proxy"])
            if not is_valid:
                errors.extend([f"Proxy config: {error}" for error in proxy_errors])
        
        return len(errors) == 0, errors
    
    @classmethod
    def validate_all_configs(cls, configs: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
        """Validate all domain configurations"""
        validation_results = {}
        
        for domain, config in configs.items():
            is_valid, errors = cls.validate_domain_config(config)
            if not is_valid:
                validation_results[domain] = errors
        
        return validation_results
    
    @classmethod
    def _is_valid_domain(cls, domain: str) -> bool:
        """Validate domain name format"""
        if not domain or len(domain) > 253:
            return False
        
        # Basic domain name regex
        domain_pattern = re.compile(
            r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$'
        )
        
        return bool(domain_pattern.match(domain))
    
    @classmethod
    def get_config_recommendations(cls, domain: str, current_config: Dict[str, Any]) -> List[str]:
        """Get configuration recommendations for a domain"""
        recommendations = []
        
        # Domain-specific recommendations
        if "69shuba" in domain.lower():
            recommendations.append("Consider using Chrome browser with Windows platform for better compatibility")
            recommendations.append("Recommended delay range: 2.0-5.0 seconds for this domain")
        elif "hetushu" in domain.lower():
            recommendations.append("Firefox browser with Linux platform works well for this domain")
            recommendations.append("Consider using nodejs interpreter for better performance")
        
        # General recommendations based on current config
        browser_config = current_config.get("browser", {})
        stealth_config = current_config.get("stealth", {})
        
        if browser_config.get("browser") == "chrome" and browser_config.get("platform") == "linux":
            recommendations.append("Chrome on Linux may have better stealth characteristics")
        
        min_delay = stealth_config.get("min_delay", 1.0)
        if min_delay < 1.0:
            recommendations.append("Consider increasing min_delay to >= 1.0 for better stealth")
        
        proxy_config = current_config.get("proxy", {})
        if not proxy_config.get("proxies"):
            recommendations.append("Consider adding proxy servers for better anonymity")
        
        return recommendations

# Convenience functions
def validate_config_file(config_data: Dict[str, Any]) -> Tuple[bool, Dict[str, List[str]]]:
    """Validate entire configuration file"""
    return ConfigValidator.validate_all_configs(config_data)

def validate_proxy_list(proxy_list: List[str]) -> Dict[str, str]:
    """Validate a list of proxy URLs"""
    results = {}
    for i, proxy in enumerate(proxy_list):
        is_valid, error = ConfigValidator.validate_proxy_url(proxy)
        if not is_valid:
            results[f"proxy_{i+1}"] = error
    return results