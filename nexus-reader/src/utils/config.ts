import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/utils/browserStorage'
import { logger } from '@/utils/logger'

class UnifiedConfig {
  private static instance: UnifiedConfig
  private config = new Map<string, unknown>()

  private constructor() {
    this.loadDefaultConfig()
  }

  static getInstance(): UnifiedConfig {
    if (!UnifiedConfig.instance) {
      UnifiedConfig.instance = new UnifiedConfig()
    }
    return UnifiedConfig.instance
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.config.get(key) as T | undefined) ?? defaultValue
  }

  set<T>(key: string, value: T): void {
    this.config.set(key, value)
    this.persistConfig()
  }

  private loadDefaultConfig(): void {
    this.config.set(
      'api.baseURL',
      import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'
    )
    this.config.set('api.timeout', 10000)
    this.config.set('cache.enabled', true)
    this.config.set('cache.ttl', 5 * 60 * 1000)
    this.config.set('features.discovery', false)
    this.config.set('features.ai', false)
    this.config.set('features.decoder', false)
    this.config.set('ui.theme', 'auto')
    this.config.set('ui.language', 'zh-CN')
    this.loadPersistedConfig()
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private loadPersistedConfig(): void {
    try {
      const persisted = getLocalStorageItem('app-config')
      if (!persisted) return

      const parsed: unknown = JSON.parse(persisted)
      if (!this.isRecord(parsed)) {
        return
      }

      Object.entries(parsed).forEach(([key, value]) => {
        this.config.set(key, value)
      })
    } catch (error) {
      logger.warn('Failed to load persisted config', { error })
    }
  }

  private persistConfig(): void {
    try {
      const toPersist: Record<string, unknown> = {}
      this.config.forEach((value, key) => {
        if (
          key.startsWith('user.') ||
          key.startsWith('ui.') ||
          key.startsWith('preferences.') ||
          key.startsWith('features.')
        ) {
          toPersist[key] = value
        }
      })
      setLocalStorageItem('app-config', JSON.stringify(toPersist))
    } catch (error) {
      logger.warn('Failed to persist config', { error })
    }
  }
}

export const config = UnifiedConfig.getInstance()
