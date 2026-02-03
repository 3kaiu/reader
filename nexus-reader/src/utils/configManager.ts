/**
 * Centralized Configuration Management for Nexus Reader
 * Provides unified configuration with runtime updates, validation, and hot reload
 */

import { ref, reactive, readonly } from 'vue'
import { logger } from './logger'

export enum ConfigEnvironment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TESTING = 'testing'
}

export enum ConfigSource {
  FILE = 'file',
  ENVIRONMENT = 'environment',
  REMOTE = 'remote',
  RUNTIME = 'runtime'
}

export interface ConfigEntry<T = any> {
  value: T
  source: ConfigSource
  lastUpdated: Date
  version: number
  checksum: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface ConfigUpdateEvent<T = any> {
  key: string
  oldValue?: T
  newValue: T
  source: ConfigSource
  timestamp: Date
}

export type ConfigUpdateListener<T = any> = (event: ConfigUpdateEvent<T>) => void

/**
 * Configuration Manager Class
 */
export class ConfigManager {
  private config = reactive<Record<string, ConfigEntry>>({})
  private validators = new Map<string, (value: any) => ValidationResult>()
  private updateListeners = new Set<ConfigUpdateListener>()
  private environment: ConfigEnvironment

  constructor(environment: ConfigEnvironment = ConfigEnvironment.DEVELOPMENT) {
    this.environment = environment
    this.registerDefaultValidators()
    this.loadFromEnvironment()
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): void {
    const envVars = {
      'VITE_API_URL': 'api.url',
      'VITE_API_TIMEOUT': 'api.timeout',
      'VITE_API_MAX_RETRIES': 'api.maxRetries',
      'VITE_ENABLE_AI': 'features.ai',
      'VITE_ENABLE_VOICE': 'features.voice',
      'VITE_ENABLE_OFFLINE': 'features.offline',
      'VITE_CACHE_SIZE': 'cache.size',
      'VITE_CACHE_TTL': 'cache.ttl'
    }

    for (const [envKey, configKey] of Object.entries(envVars)) {
      const envValue = import.meta.env[envKey]
      if (envValue !== undefined) {
        this.setConfig(configKey, envValue, ConfigSource.ENVIRONMENT)
      }
    }
  }

  /**
   * Load configuration from JSON file
   */
  async loadFromFile(filePath: string): Promise<void> {
    try {
      const response = await fetch(filePath)
      if (!response.ok) {
        throw new Error(`Failed to load config file: ${response.status}`)
      }

      const data = await response.json()
      for (const [key, value] of Object.entries(data)) {
        this.setConfig(key, value, ConfigSource.FILE)
      }

      logger.info('Configuration loaded from file:', filePath)
    } catch (error) {
      logger.error('Failed to load config from file:', filePath, error)
      throw error
    }
  }

  /**
   * Set configuration value with validation
   */
  setConfig<T>(key: string, value: T, source: ConfigSource = ConfigSource.RUNTIME): void {
    // Validate the value
    const validation = this.validateConfigValue(key, value)
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed for ${key}: ${validation.errors.join(', ')}`)
    }

    // Calculate checksum
    const checksum = this.calculateChecksum(value)

    // Store old value for event
    const oldEntry = this.config[key]
    const oldValue = oldEntry?.value

    // Update configuration
    this.config[key] = {
      value,
      source,
      lastUpdated: new Date(),
      version: (oldEntry?.version || 0) + 1,
      checksum
    }

    // Notify listeners if value changed
    if (oldValue !== value) {
      const event: ConfigUpdateEvent<T> = {
        key,
        oldValue,
        newValue: value,
        source,
        timestamp: new Date()
      }
      this.notifyUpdate(event)
    }

    logger.debug(`Configuration updated: ${key} =`, value, `(source: ${source})`)
  }

  /**
   * Get configuration value
   */
  getConfig<T>(key: string, defaultValue?: T): T | undefined {
    const entry = this.config[key]
    return entry ? entry.value : defaultValue
  }

  /**
   * Get configuration entry with metadata
   */
  getConfigEntry<T>(key: string): ConfigEntry<T> | undefined {
    return this.config[key] as ConfigEntry<T>
  }

  /**
   * Get all configuration values
   */
  getAllConfig(): Record<string, any> {
    const result: Record<string, any> = {}
    for (const [key, entry] of Object.entries(this.config)) {
      result[key] = entry.value
    }
    return result
  }

  /**
   * Register configuration validator
   */
  registerValidator(keyPattern: string, validator: (value: any) => ValidationResult): void {
    this.validators.set(keyPattern, validator)
  }

  /**
   * Add configuration update listener
   */
  addUpdateListener<T = any>(listener: ConfigUpdateListener<T>): () => void {
    this.updateListeners.add(listener)

    // Return unsubscribe function
    return () => {
      this.updateListeners.delete(listener)
    }
  }

  /**
   * Validate configuration value
   */
  validateConfigValue(key: string, value: any): ValidationResult {
    // Check registered validators
    for (const [pattern, validator] of this.validators) {
      if (key.includes(pattern)) {
        return validator(value)
      }
    }

    // Default validation based on key
    return this.getDefaultValidation(key, value)
  }

  /**
   * Validate all configuration
   */
  validateAllConfig(): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    for (const [key, entry] of Object.entries(this.config)) {
      const validation = this.validateConfigValue(key, entry.value)
      errors.push(...validation.errors)
      warnings.push(...validation.warnings)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Export configuration to JSON
   */
  exportConfig(): string {
    const data: Record<string, any> = {}
    for (const [key, entry] of Object.entries(this.config)) {
      data[key] = entry
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * Watch configuration file for changes (polling)
   */
  watchFile(filePath: string, intervalMs: number = 5000): () => void {
    let lastModified: number | null = null
    let isWatching = true

    const checkFile = async () => {
      if (!isWatching) return

      try {
        const response = await fetch(filePath, { method: 'HEAD' })
        const modified = response.headers.get('last-modified')

        if (modified && modified !== lastModified) {
          lastModified = modified as any
          logger.info('Configuration file changed:', filePath)
          await this.loadFromFile(filePath)
        }
      } catch (error) {
        logger.warn('Failed to check config file:', filePath, error)
      }

      if (isWatching) {
        setTimeout(checkFile, intervalMs)
      }
    }

    // Start watching
    setTimeout(checkFile, intervalMs)

    // Return stop function
    return () => {
      isWatching = false
    }
  }

  private notifyUpdate<T>(event: ConfigUpdateEvent<T>): void {
    for (const listener of this.updateListeners) {
      try {
        listener(event)
      } catch (error) {
        logger.error('Error in config update listener:', error)
      }
    }
  }

  private calculateChecksum(value: any): string {
    const data = JSON.stringify(value, Object.keys(value).sort())
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit
    }
    return Math.abs(hash).toString(36)
  }

  private getDefaultValidation(key: string, value: any): ValidationResult {
    // Default validations based on key patterns
    if (key.includes('port')) {
      const isValid = typeof value === 'number' && value > 0 && value <= 65535
      return {
        isValid,
        errors: isValid ? [] : ['Port must be a number between 1 and 65535'],
        warnings: []
      }
    }

    if (key.includes('timeout')) {
      const isValid = typeof value === 'number' && value > 0
      return {
        isValid,
        errors: isValid ? [] : ['Timeout must be a positive number'],
        warnings: []
      }
    }

    if (key.includes('enabled') || key.includes('enable')) {
      const isValid = typeof value === 'boolean'
      return {
        isValid,
        errors: isValid ? [] : ['Value must be a boolean'],
        warnings: []
      }
    }

    if (key.includes('url')) {
      const isValid = typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))
      return {
        isValid,
        errors: isValid ? [] : ['URL must start with http:// or https://'],
        warnings: []
      }
    }

    // Default: accept any value
    return {
      isValid: true,
      errors: [],
      warnings: []
    }
  }

  private registerDefaultValidators(): void {
    // API timeout validator
    this.registerValidator('api.timeout', (value) => ({
      isValid: typeof value === 'number' && value >= 1000 && value <= 60000,
      errors: typeof value === 'number' && value >= 1000 && value <= 60000
        ? []
        : ['API timeout must be between 1000ms and 60000ms'],
      warnings: []
    }))

    // Cache size validator
    this.registerValidator('cache.size', (value) => ({
      isValid: typeof value === 'number' && value >= 0,
      errors: typeof value === 'number' && value >= 0 ? [] : ['Cache size must be a non-negative number'],
      warnings: value > 100 * 1024 * 1024 ? ['Large cache size may impact performance'] : []
    }))

    // Cache TTL validator
    this.registerValidator('cache.ttl', (value) => ({
      isValid: typeof value === 'number' && value >= 0,
      errors: typeof value === 'number' && value >= 0 ? [] : ['Cache TTL must be a non-negative number'],
      warnings: value > 24 * 60 * 60 ? ['Very long cache TTL may cause stale data'] : []
    }))
  }
}

// Global configuration manager instance
let globalConfigManager: ConfigManager | null = null

/**
 * Get global configuration manager instance
 */
export function getConfigManager(): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(
      (import.meta.env.VITE_ENV as ConfigEnvironment) || ConfigEnvironment.DEVELOPMENT
    )
  }
  return globalConfigManager
}

/**
 * Initialize configuration manager with default values
 */
export function initConfigManager(): ConfigManager {
  const manager = getConfigManager()

  // Set default configurations
  manager.setConfig('api.timeout', 30000, ConfigSource.RUNTIME)
  manager.setConfig('api.maxRetries', 3, ConfigSource.RUNTIME)
  manager.setConfig('cache.size', 100 * 1024 * 1024, ConfigSource.RUNTIME) // 100MB
  manager.setConfig('cache.ttl', 3600000, ConfigSource.RUNTIME) // 1 hour
  manager.setConfig('features.ai', true, ConfigSource.RUNTIME)
  manager.setConfig('features.voice', false, ConfigSource.RUNTIME)
  manager.setConfig('features.offline', true, ConfigSource.RUNTIME)

  logger.info('Configuration manager initialized')

  return manager
}

// Reactive configuration accessors
export const configManager = readonly(reactive(getConfigManager()))

// Convenience functions
export function getConfig<T>(key: string, defaultValue?: T): T | undefined {
  return getConfigManager().getConfig(key, defaultValue)
}

export function setConfig<T>(key: string, value: T, source: ConfigSource = ConfigSource.RUNTIME): void {
  getConfigManager().setConfig(key, value, source)
}

export function watchConfig<T>(key: string, callback: (value: T) => void): () => void {
  const manager = getConfigManager()
  return manager.addUpdateListener((event) => {
    if (event.key === key) {
      callback(event.newValue)
    }
  })
}