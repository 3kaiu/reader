export class UnifiedStorage {
  private static instance: UnifiedStorage

  private constructor() {}

  static getInstance(): UnifiedStorage {
    if (!UnifiedStorage.instance) {
      UnifiedStorage.instance = new UnifiedStorage()
    }
    return UnifiedStorage.instance
  }

  get<T>(key: string, defaultValue?: T): T | null {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : (defaultValue ?? null)
    } catch (error) {
      console.error('Storage get error:', error)
      return defaultValue ?? null
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error('Storage set error:', error)
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error('Storage remove error:', error)
    }
  }

  clear(): void {
    try {
      localStorage.clear()
    } catch (error) {
      console.error('Storage clear error:', error)
    }
  }

  keys(): string[] {
    try {
      const keys: string[] = []
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key) keys.push(key)
      }
      return keys
    } catch (error) {
      console.error('Storage keys error:', error)
      return []
    }
  }
}

export const storage = UnifiedStorage.getInstance()
