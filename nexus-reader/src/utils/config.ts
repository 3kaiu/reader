export class UnifiedConfig {
  private static instance: UnifiedConfig
  private config = new Map<string, any>()

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
    return this.config.get(key) ?? defaultValue
  }

  set<T>(key: string, value: T): void {
    this.config.set(key, value)
    this.persistConfig()
  }

  private loadDefaultConfig(): void {
    this.config.set('api.baseURL', import.meta.env.VITE_API_BASE_URL || '/api')
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

  private loadPersistedConfig(): void {
    try {
      const persisted = localStorage.getItem('app-config')
      if (!persisted) return

      const parsed = JSON.parse(persisted)
      Object.entries(parsed).forEach(([key, value]) => {
        this.config.set(key, value)
      })
    } catch (error) {
      console.warn('Failed to load persisted config:', error)
    }
  }

  private persistConfig(): void {
    try {
      const toPersist: Record<string, any> = {}
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
      localStorage.setItem('app-config', JSON.stringify(toPersist))
    } catch (error) {
      console.warn('Failed to persist config:', error)
    }
  }
}

export const config = UnifiedConfig.getInstance()
