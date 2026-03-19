type Loader<T> = () => Promise<T>

class AdaptiveAssetLoader {
  private moduleCache = new Map<string, Promise<unknown>>()

  async loadHeavyModule<T>(key: string, loader: Loader<T>): Promise<T> {
    if (!this.moduleCache.has(key)) {
      this.moduleCache.set(key, loader())
    }

    try {
      return await this.moduleCache.get(key) as T
    } catch (error) {
      this.moduleCache.delete(key)
      throw error
    }
  }

  clear(key?: string): void {
    if (key) {
      this.moduleCache.delete(key)
      return
    }

    this.moduleCache.clear()
  }
}

export const AdaptiveLoader = new AdaptiveAssetLoader()
