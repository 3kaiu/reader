"""
Configuration Manager for CF Bypass Service
Manages domain-specific CloudScraper configurations with validation.
"""
import json
import logging
from typing import Dict, List, Any
from dataclasses import dataclass, asdict
from pathlib import Path

logger = logging.getLogger(__name__)

@dataclass
class BrowserConfig:
    """Browser configuration for CloudScraper"""
    browser: str = "chrome"
    platform: str = "windows"
    
    def validate(self) -> bool:
        """Validate browser configuration"""
        valid_browsers = ["chrome", "firefox", "safari", "edge"]
        valid_platforms = ["windows", "linux", "darwin", "android", "ios"]
        
        if self.browser not in valid_browsers:
            raise ValueError(f"Invalid browser: {self.browser}. Must be one of {valid_browsers}")
        
        if self.platform not in valid_platforms:
            raise ValueError(f"Invalid platform: {self.platform}. Must be one of {valid_platforms}")
        
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
        if self.min_delay < 0 or self.max_delay < 0:
            raise ValueError("Delays must be non-negative")
        
        if self.min_delay > self.max_delay:
            raise ValueError("min_delay must be <= max_delay")
        
        if self.max_delay > 30:
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
        valid_strategies = ["sequential", "random", "smart"]
        
        if self.rotation_strategy not in valid_strategies:
            raise ValueError(f"Invalid rotation_strategy: {self.rotation_strategy}. Must be one of {valid_strategies}")
        
        if self.ban_time < 0:
            raise ValueError("ban_time must be non-negative")
        
        # Validate proxy URLs
        for proxy in self.proxies:
            if not self._validate_proxy_url(proxy):
                raise ValueError(f"Invalid proxy URL: {proxy}")
        
        return True
    
    def _validate_proxy_url(self, proxy: str) -> bool:
        """Validate proxy URL format"""
        if not proxy:
            return False
        
        # Basic validation for proxy URL format
        valid_schemes = ["http://", "https://", "socks4://", "socks5://"]
        return any(proxy.startswith(scheme) for scheme in valid_schemes)

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
    
    def validate(self) -> bool:
        """Validate complete domain configuration"""
        valid_interpreters = ["js2py", "nodejs", "v8"]
        
        if self.interpreter not in valid_interpreters:
            raise ValueError(f"Invalid interpreter: {self.interpreter}. Must be one of {valid_interpreters}")
        
        if self.timeout <= 0:
            raise ValueError("timeout must be positive")
        
        # Validate sub-configurations
        self.browser.validate()
        self.stealth.validate()
        self.proxy.validate()
        
        return True
    
    def to_cloudscraper_config(self) -> Dict[str, Any]:
        """Convert to CloudScraper configuration format"""
        # Only include parameters that are actually supported by cloudscraper
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

class ConfigManager:
    """Manages domain configurations with hot-reload support"""
    
    def __init__(self, config_file: str = "domain_configs.json"):
        self.config_file = Path(config_file)
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
                        enabled=config_data.get("enabled", True)
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
                    "enabled": config.enabled
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