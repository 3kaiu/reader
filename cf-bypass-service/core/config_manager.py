"""
Centralized Configuration Management for CF Bypass Service
Provides unified configuration with runtime updates, validation, and hot reload
"""

import os
import json
import hashlib
import asyncio
import threading
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
import logging

from config import phase2_config

logger = logging.getLogger(__name__)


class ConfigEnvironment(Enum):
    """Configuration environment"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TESTING = "testing"


class ConfigSource(Enum):
    """Configuration source type"""
    FILE = "file"
    ENVIRONMENT = "environment"
    REMOTE = "remote"
    RUNTIME = "runtime"


@dataclass
class ConfigEntry:
    """Configuration entry with metadata"""
    value: Any
    source: ConfigSource
    last_updated: datetime
    version: int
    checksum: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "value": self.value,
            "source": self.source.value,
            "last_updated": self.last_updated.isoformat(),
            "version": self.version,
            "checksum": self.checksum
        }


@dataclass
class ValidationResult:
    """Configuration validation result"""
    is_valid: bool
    errors: List[str]
    warnings: List[str]


@dataclass
class ConfigUpdateEvent:
    """Configuration update event"""
    key: str
    old_value: Any
    new_value: Any
    source: ConfigSource
    timestamp: datetime


class ConfigManager:
    """
    Centralized configuration manager with hot reload capabilities

    Features:
    - Multi-environment support
    - Runtime configuration updates
    - Configuration validation
    - Hot reload from files
    - Change notifications
    """

    def __init__(self, environment: ConfigEnvironment = ConfigEnvironment.DEVELOPMENT):
        self.environment = environment
        self._config: Dict[str, ConfigEntry] = {}
        self._validators: Dict[str, Callable[[Any], ValidationResult]] = {}
        self._update_callbacks: List[Callable[[ConfigUpdateEvent], None]] = []
        self._lock = threading.RLock()
        self._file_watchers: Dict[str, asyncio.Task] = {}

        # Register default validators
        self._register_default_validators()

    def load_from_file(self, file_path: str) -> None:
        """Load configuration from JSON file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            for key, value in data.items():
                self.set_config(key, value, ConfigSource.FILE)

            logger.info(f"Configuration loaded from file: {file_path}")

        except Exception as e:
            logger.error(f"Failed to load config from {file_path}: {e}")
            raise

    def load_from_env(self, prefix: str = "CF_") -> None:
        """Load configuration from environment variables"""
        for key, value in os.environ.items():
            if key.startswith(prefix):
                config_key = key[len(prefix):].lower().replace('_', '.')
                self.set_config(config_key, value, ConfigSource.ENVIRONMENT)

        logger.info(f"Configuration loaded from environment (prefix: {prefix})")

    def set_config(self, key: str, value: Any, source: ConfigSource) -> None:
        """Set configuration value with validation"""
        with self._lock:
            # Validate the new value
            validation = self._validate_config_value(key, value)
            if not validation.is_valid:
                raise ValueError(f"Configuration validation failed for {key}: {validation.errors}")

            # Calculate checksum
            checksum = self._calculate_checksum(value)

            # Store old value for event
            old_value = None
            if key in self._config:
                old_value = self._config[key].value

            # Update configuration
            self._config[key] = ConfigEntry(
                value=value,
                source=source,
                last_updated=datetime.now(),
                version=self._config.get(key, ConfigEntry(None, source, datetime.now(), 0, "")).version + 1,
                checksum=checksum
            )

            # Notify listeners
            if old_value != value:
                event = ConfigUpdateEvent(
                    key=key,
                    old_value=old_value,
                    new_value=value,
                    source=source,
                    timestamp=datetime.now()
                )
                self._notify_update(event)

            logger.debug(f"Configuration updated: {key} = {value} (source: {source.value})")

    def get_config(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        with self._lock:
            entry = self._config.get(key)
            return entry.value if entry else default

    def get_all_config(self) -> Dict[str, Any]:
        """Get all configuration values"""
        with self._lock:
            return {key: entry.value for key, entry in self._config.items()}

    def get_config_entry(self, key: str) -> Optional[ConfigEntry]:
        """Get configuration entry with metadata"""
        with self._lock:
            return self._config.get(key)

    def register_validator(self, key_pattern: str, validator: Callable[[Any], ValidationResult]) -> None:
        """Register configuration validator"""
        with self._lock:
            self._validators[key_pattern] = validator

    def add_update_listener(self, callback: Callable[[ConfigUpdateEvent], None]) -> None:
        """Add configuration update listener"""
        with self._lock:
            self._update_callbacks.append(callback)

    def watch_file(self, file_path: str, interval: float = 5.0) -> None:
        """Watch configuration file for changes"""
        async def watch_loop():
            import time
            last_mtime = 0

            while True:
                try:
                    stat = os.stat(file_path)
                    if stat.st_mtime > last_mtime:
                        last_mtime = stat.st_mtime
                        logger.info(f"Configuration file changed: {file_path}")
                        self.load_from_file(file_path)
                except Exception as e:
                    logger.error(f"Error watching config file {file_path}: {e}")

                await asyncio.sleep(interval)

        loop = asyncio.new_event_loop()
        task = loop.create_task(watch_loop())
        self._file_watchers[file_path] = task

    def export_config(self, file_path: str) -> None:
        """Export current configuration to file"""
        with self._lock:
            data = {}
            for key, entry in self._config.items():
                data[key] = entry.to_dict()

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            logger.info(f"Configuration exported to: {file_path}")

    def validate_all_config(self) -> ValidationResult:
        """Validate all configuration values"""
        errors = []
        warnings = []

        with self._lock:
            for key, entry in self._config.items():
                validation = self._validate_config_value(key, entry.value)
                errors.extend(validation.errors)
                warnings.extend(validation.warnings)

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings
        )

    def _validate_config_value(self, key: str, value: Any) -> ValidationResult:
        """Validate a single configuration value"""
        # Check registered validators
        for pattern, validator in self._validators.items():
            if pattern in key:
                return validator(value)

        # Default validation
        return ValidationResult(is_valid=True, errors=[], warnings=[])

    def _calculate_checksum(self, value: Any) -> str:
        """Calculate checksum for configuration value"""
        data = json.dumps(value, sort_keys=True, default=str)
        return hashlib.sha256(data.encode()).hexdigest()[:16]

    def _notify_update(self, event: ConfigUpdateEvent) -> None:
        """Notify all update listeners"""
        for callback in self._update_callbacks:
            try:
                callback(event)
            except Exception as e:
                logger.error(f"Error in config update callback: {e}")

    def _register_default_validators(self) -> None:
        """Register default configuration validators"""

        # Port validator
        self.register_validator("port", lambda value: ValidationResult(
            is_valid=isinstance(value, int) and 1 <= value <= 65535,
            errors=["Port must be between 1 and 65535"] if not (isinstance(value, int) and 1 <= value <= 65535) else [],
            warnings=[]
        ))

        # Boolean validator
        self.register_validator("enabled", lambda value: ValidationResult(
            is_valid=isinstance(value, bool),
            errors=["Value must be a boolean"] if not isinstance(value, bool) else [],
            warnings=[]
        ))

        # URL validator
        self.register_validator("url", lambda value: ValidationResult(
            is_valid=isinstance(value, str) and value.startswith(("http://", "https://")),
            errors=["URL must start with http:// or https://"] if not (isinstance(value, str) and value.startswith(("http://", "https://"))) else [],
            warnings=[]
        ))

        # Timeout validator
        self.register_validator("timeout", lambda value: ValidationResult(
            is_valid=isinstance(value, (int, float)) and value > 0,
            errors=["Timeout must be a positive number"] if not (isinstance(value, (int, float)) and value > 0) else [],
            warnings=[]
        ))


# Global configuration manager instance
_global_config_manager: Optional[ConfigManager] = None
_config_lock = threading.Lock()


def get_config_manager() -> ConfigManager:
    """Get global configuration manager instance"""
    global _global_config_manager

    if _global_config_manager is None:
        with _config_lock:
            if _global_config_manager is None:
                _global_config_manager = ConfigManager()

    return _global_config_manager


def init_config_manager(environment: ConfigEnvironment = ConfigEnvironment.DEVELOPMENT) -> ConfigManager:
    """Initialize global configuration manager"""
    global _global_config_manager

    with _config_lock:
        if _global_config_manager is None:
            _global_config_manager = ConfigManager(environment)

            # Load default configuration
            _global_config_manager.set_config("phase2.session_pool.enabled", phase2_config.session_pool_enabled, ConfigSource.RUNTIME)
            _global_config_manager.set_config("phase2.connection_pool.enabled", phase2_config.connection_pool_enabled, ConfigSource.RUNTIME)
            _global_config_manager.set_config("phase2.adaptive_retry.enabled", phase2_config.adaptive_retry_enabled, ConfigSource.RUNTIME)
            _global_config_manager.set_config("phase2.memory_optimization.enabled", phase2_config.memory_optimization_enabled, ConfigSource.RUNTIME)
            _global_config_manager.set_config("phase2.health_monitoring.enabled", phase2_config.health_monitoring_enabled, ConfigSource.RUNTIME)

            logger.info(f"Configuration manager initialized for environment: {environment.value}")

    return _global_config_manager


# Utility functions for common configuration access
def get_session_pool_enabled() -> bool:
    """Get session pool enabled status"""
    return get_config_manager().get_config("phase2.session_pool.enabled", True)


def get_connection_pool_enabled() -> bool:
    """Get connection pool enabled status"""
    return get_config_manager().get_config("phase2.connection_pool.enabled", True)


def get_adaptive_retry_enabled() -> bool:
    """Get adaptive retry enabled status"""
    return get_config_manager().get_config("phase2.adaptive_retry.enabled", True)


def get_memory_optimization_enabled() -> bool:
    """Get memory optimization enabled status"""
    return get_config_manager().get_config("phase2.memory_optimization.enabled", True)


def get_health_monitoring_enabled() -> bool:
    """Get health monitoring enabled status"""
    return get_config_manager().get_config("phase2.health_monitoring.enabled", True)