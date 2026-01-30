"""
Configuration Manager for CF Bypass Service
Manages domain-specific CloudScraper configurations with validation.

Integrated with validation logic for high cohesion.
"""
import json
import logging
import re
import ipaddress
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Validation Constants
# ─────────────────────────────────────────────────────────────

VALID_BROWSERS = ["chrome", "firefox", "safari", "edge", "opera"]
VALID_PLATFORMS = ["windows", "linux", "darwin", "android", "ios"]
VALID_INTERPRETERS = ["js2py", "nodejs", "v8"]
VALID_PROXY_SCHEMES = ["http", "https", "socks4", "socks5"]
VALID_ROTATION_STRATEGIES = ["sequential", "random", "smart"]

MAX_DELAY = 60.0
MIN_DELAY = 0.1
MAX_TIMEOUT = 300
MIN_TIMEOUT = 5
MAX_BAN_TIME = 3600


# ─────────────────────────────────────────────────────────────
# Configuration Data Classes
# ─────────────────────────────────────────────────────────────

@dataclass
class BrowserConfig:
    """Browser configuration for CloudScraper"""
    browser: str = "chrome"
    platform: str = "windows"
    mobile: bool = False
    
    def validate(self) -> bool:
        """Validate browser configuration"""
        if self.browser not in VALID_BROWSERS:
            raise ValueError(f"Invalid browser: {self.browser}. Must be one of {VALID_BROWSERS}")
        
        if self.platform not in VALID_PLATFORMS:
            raise ValueError(f"Invalid platform: {self.platform}. Must be one of {VALID_PLATFORMS}")
        
        # Check invalid combinations
        if self.browser == "safari" and self.platform not in ["darwin", "ios"]:
            raise ValueError("Safari browser is only available on darwin (macOS) and ios platforms")
        
        if self.browser == "edge" and self.platform not in ["windows", "android"]:
            logger.warning("Edge browser is primarily available on windows and android platforms")
        
        return True


@dataclass
class StealthConfig:
    """Stealth mode configuration"""
    min_delay: float = 1.0
    max_delay: float = 3.0
    human_like_delays: bool = True
    randomize_headers: bool = True
    
    def validate(self) -> bool:
        """Validate stealth configuration"""
        if self.min_delay < MIN_DELAY or self.max_delay < MIN_DELAY:
            raise ValueError(f"Delays must be >= {MIN_DELAY}")
        
        if self.min_delay > self.max_delay:
            raise ValueError("min_delay must be <= max_delay")
        
        if self.max_delay > MAX_DELAY:
            logger.warning(f"max_delay {self.max_delay}s is very high, may impact performance")
        
        return True


@dataclass
class ProxyConfig:
    """Proxy configuration"""
    proxies: List[str] = None
    rotation_strategy: str = "smart"
    ban_time: int = 300
    
    def __post_init__(self):
        if self.proxies is None:
            self.proxies = []
    
    def validate(self) -> bool:
        """Validate proxy configuration"""
        if self.rotation_strategy not in VALID_ROTATION_STRATEGIES:
            raise ValueError(f"Invalid rotation_strategy: {self.rotation_strategy}. Must be one of {VALID_ROTATION_STRATEGIES}")
        
        if self.ban_time < 0 or self.ban_time > MAX_BAN_TIME:
            raise ValueError(f"ban_time must be between 0 and {MAX_BAN_TIME}")
        
        # Validate proxy URLs
        for proxy in self.proxies:
            if not _validate_proxy_url(proxy):
                raise ValueError(f"Invalid proxy URL: {proxy}")
        
        return True


@dataclass
class DomainConfig:
    """Complete domain configuration"""
    domain: str
    browser: BrowserConfig
    stealth: StealthConfig
    proxy: ProxyConfig
    interpreter: str = "js2py"
    timeout: int = 30
    enabled: bool = True
    retry_on_403: bool = False
    max_retries: int = 3
    
    def validate(self) -> bool:
        """Validate complete domain configuration"""
        if self.interpreter not in VALID_INTERPRETERS:
            raise ValueError(f"Invalid interpreter: {self.interpreter}. Must be one of {VALID_INTERPRETERS}")
        
        if self.timeout < MIN_TIMEOUT or self.timeout > MAX_TIMEOUT:
            raise ValueError(f"timeout must be between {MIN_TIMEOUT} and {MAX_TIMEOUT}")
        
        # Validate sub-configurations
        self.browser.validate()
        self.stealth.validate()
        self.proxy.validate()
        
        return True
    
    def to_cloudscraper_config(self) -> Dict[str, Any]:
        """Convert to CloudScraper configuration format"""
        config = {
            "interpreter": self.interpreter,
            "browser": asdict(self.browser),
            "delay": self.stealth.min_delay,
            "debug": False
        }
        
        # Add proxy configuration if proxies are available
        if self.proxy.proxies:
            config.update({
                "rotating_proxies": self.proxy.proxies,
                "proxy_options": {
                    "rotation_strategy": self.proxy.rotation_strategy,
                    "ban_time": self.proxy.ban_time
                }
            })
        
        return config


# ─────────────────────────────────────────────────────────────
# Validation Helper Functions
# ─────────────────────────────────────────────────────────────

def _validate_proxy_url(proxy_url: str) -> bool:
    """Validate a single proxy URL"""
    if not proxy_url or not isinstance(proxy_url, str):
        return False
    
    try:
        parsed = urlparse(proxy_url)
        
        # Check scheme
        if parsed.scheme not in VALID_PROXY_SCHEMES:
            return False
        
        # Check hostname
        if not parsed.hostname:
            return False
        
        # Validate hostname (IP or domain)
        hostname = parsed.hostname
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            # Not an IP, validate as domain name
            if not _is_valid_domain(hostname):
                return False
        
        # Check port
        if parsed.port is not None:
            if not (1 <= parsed.port <= 65535):
                return False
        
        return True
        
    except Exception:
        return False


def _is_valid_domain(domain: str) -> bool:
    """Validate domain name format"""
    if not domain or len(domain) > 253:
        return False
    
    domain_pattern = re.compile(
        r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*'
        r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$'
    )
    
    return bool(domain_pattern.match(domain))


# ─────────────────────────────────────────────────────────────
# Configuration Manager
# ─────────────────────────────────────────────────────────────

class ConfigManager:
    """Manages domain configurations with hot-reload support"""
    
    def __init__(self, config_file: str = "data/domain_configs.json"):
        self.config_file = Path(config_file)
        # Ensure data directory exists
        self.config_file.parent.mkdir(parents=True, exist_ok=True)
        self.configs: Dict[str, DomainConfig] = {}
        self._load_default_configs()
        
        # Try to load from file
        if self.config_file.exists():
            self.load_from_file()
        else:
            self.save_to_file()  # Create default config file
    
    def _load_default_configs(self):
        """Load default configurations for known domains"""
        default_configs = {
            "69shuba.com": DomainConfig(
                domain="69shuba.com",
                browser=BrowserConfig(browser="chrome", platform="windows"),
                stealth=StealthConfig(min_delay=2.0, max_delay=5.0),
                proxy=ProxyConfig(rotation_strategy="smart"),
                interpreter="js2py"
            ),
            "hetushu.com": DomainConfig(
                domain="hetushu.com",
                browser=BrowserConfig(browser="firefox", platform="linux"),
                stealth=StealthConfig(min_delay=1.5, max_delay=4.0),
                proxy=ProxyConfig(rotation_strategy="random"),
                interpreter="nodejs"
            ),
            "default": DomainConfig(
                domain="default",
                browser=BrowserConfig(browser="chrome", platform="windows"),
                stealth=StealthConfig(min_delay=1.0, max_delay=3.0),
                proxy=ProxyConfig(rotation_strategy="smart"),
                interpreter="js2py"
            )
        }
        
        # Validate all default configs
        for domain, config in default_configs.items():
            try:
                config.validate()
                self.configs[domain] = config
            except ValueError as e:
                logger.error(f"Invalid default config for {domain}: {e}")
    
    def get_config(self, domain: str) -> DomainConfig:
        """Get configuration for a domain"""
        if domain in self.configs:
            return self.configs[domain]
        
        # Return default config if domain not found
        return self.configs.get("default", self._create_fallback_config())
    
    def _create_fallback_config(self) -> DomainConfig:
        """Create a fallback configuration if default is missing"""
        return DomainConfig(
            domain="fallback",
            browser=BrowserConfig(),
            stealth=StealthConfig(),
            proxy=ProxyConfig(),
            interpreter="js2py"
        )
    
    def update_from_performance(self, domain: str, success_rate: float, avg_duration: float, top_error: Optional[str] = None) -> bool:
        """
        Auto-Evolution: Update domain config based on real-world performance.
        Allows the system to self-heal and optimize without manual intervention.
        """
        config = self.get_config(domain)
        if domain == "default" or not config.enabled:
            return False
            
        modified = False
        
        # Strategy 1: Low success rate on Scraper -> Upgrade to Mesh
        if config.interpreter == "js2py" and success_rate < 0.6:
            logger.info(f"Auto-Evolution: Upgrading {domain} to Mesh engine due to low success rate ({success_rate:.1%})")
            # We model "Mesh" by switching to nodejs or indicating external engine preference
            # Note: The EngineFactory actually handles the physical switch, but we update the config 
            # so the preference is remembered.
            config.interpreter = "nodejs"
            config.max_retries = 5
            modified = True
            
        # Strategy 2: High latency or frequent 429s -> Increase stealth
        if (avg_duration > 15.0 or (top_error and "429" in top_error)) and config.stealth.min_delay < 5.0:
            logger.info(f"Auto-Evolution: Increasing stealth for {domain} due to high latency/429")
            config.stealth.min_delay += 0.5
            config.stealth.max_delay += 1.0
            modified = True
            
        # Strategy 3: Stable performance -> Optional optimization (cost/speed)
        if success_rate > 0.95 and config.stealth.min_delay > 1.0:
            # Slightly reduce delay if very stable to improve speed
            config.stealth.min_delay = max(1.0, config.stealth.min_delay - 0.1)
            modified = True

        if modified:
            self.add_config(domain, config)
            self.save_to_file()
            return True
            
        return False
    
    def add_config(self, domain: str, config: DomainConfig) -> bool:
        """Add or update domain configuration"""
        try:
            config.validate()
            self.configs[domain] = config
            logger.info(f"Added/updated configuration for domain: {domain}")
            return True
        except ValueError as e:
            logger.error(f"Invalid configuration for {domain}: {e}")
            return False
    
    def remove_config(self, domain: str) -> bool:
        """Remove domain configuration"""
        if domain in self.configs and domain != "default":
            del self.configs[domain]
            logger.info(f"Removed configuration for domain: {domain}")
            return True
        return False
    
    def load_from_file(self) -> bool:
        """Load configurations from JSON file"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            loaded_configs = {}
            for domain, config_data in data.items():
                try:
                    # Reconstruct DomainConfig from JSON data
                    browser = BrowserConfig(**config_data.get("browser", {}))
                    stealth = StealthConfig(**config_data.get("stealth", {}))
                    proxy = ProxyConfig(**config_data.get("proxy", {}))
                    
                    config = DomainConfig(
                        domain=domain,
                        browser=browser,
                        stealth=stealth,
                        proxy=proxy,
                        interpreter=config_data.get("interpreter", "js2py"),
                        timeout=config_data.get("timeout", 30),
                        enabled=config_data.get("enabled", True),
                        retry_on_403=config_data.get("retry_on_403", False),
                        max_retries=config_data.get("max_retries", 3)
                    )
                    
                    config.validate()
                    loaded_configs[domain] = config
                    
                except Exception as e:
                    logger.error(f"Failed to load config for {domain}: {e}")
            
            if loaded_configs:
                self.configs.update(loaded_configs)
                logger.info(f"Loaded {len(loaded_configs)} domain configurations")
                return True
            
        except Exception as e:
            logger.error(f"Failed to load config file {self.config_file}: {e}")
        
        return False
    
    def save_to_file(self) -> bool:
        """Save configurations to JSON file"""
        try:
            # Convert configs to JSON-serializable format
            data = {}
            for domain, config in self.configs.items():
                data[domain] = {
                    "browser": asdict(config.browser),
                    "stealth": asdict(config.stealth),
                    "proxy": asdict(config.proxy),
                    "interpreter": config.interpreter,
                    "timeout": config.timeout,
                    "enabled": config.enabled,
                    "retry_on_403": config.retry_on_403,
                    "max_retries": config.max_retries
                }
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved {len(self.configs)} configurations to {self.config_file}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save config file {self.config_file}: {e}")
            return False
    
    def reload(self) -> bool:
        """Reload configurations from file"""
        logger.info("Reloading domain configurations...")
        return self.load_from_file()
    
    def get_all_configs(self) -> Dict[str, DomainConfig]:
        """Get all domain configurations"""
        return self.configs.copy()
    
    def validate_all_configs(self) -> Dict[str, str]:
        """Validate all configurations and return any errors"""
        errors = {}
        for domain, config in self.configs.items():
            try:
                config.validate()
            except ValueError as e:
                errors[domain] = str(e)
        
        return errors

# Global config manager instance
config_manager = ConfigManager()