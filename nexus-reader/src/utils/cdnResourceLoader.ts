/**
 * CDN Resource Loader
 * Handles loading of resources from CDN with fallback mechanisms
 */

export interface CDNResource {
  name: string
  url: string
  fallbackUrl?: string
  type: 'script' | 'style' | 'module'
  integrity?: string
  crossorigin?: string
}

export interface LoadOptions {
  timeout?: number
  retries?: number
  cache?: boolean
}

class CDNResourceLoader {
  private loadedResources = new Set<string>()
  private loadingPromises = new Map<string, Promise<void>>()

  /**
   * Load a resource from CDN
   */
  async loadResource(resource: CDNResource, options: LoadOptions = {}): Promise<void> {
    const { timeout = 10000, retries = 2, cache = true } = options

    // Check if already loaded
    if (cache && this.loadedResources.has(resource.name)) {
      return
    }

    // Check if currently loading
    if (this.loadingPromises.has(resource.name)) {
      return this.loadingPromises.get(resource.name)!
    }

    // Start loading
    const loadPromise = this.doLoadResource(resource, timeout, retries)
    this.loadingPromises.set(resource.name, loadPromise)

    try {
      await loadPromise
      if (cache) {
        this.loadedResources.add(resource.name)
      }
    } finally {
      this.loadingPromises.delete(resource.name)
    }
  }

  /**
   * Load multiple resources in parallel
   */
  async loadResources(resources: CDNResource[], options: LoadOptions = {}): Promise<void> {
    const promises = resources.map(resource => this.loadResource(resource, options))
    await Promise.all(promises)
  }

  /**
   * Check if a resource is loaded
   */
  isLoaded(resourceName: string): boolean {
    return this.loadedResources.has(resourceName)
  }

  /**
   * Clear loaded resources cache
   */
  clearCache(): void {
    this.loadedResources.clear()
  }

  private async doLoadResource(resource: CDNResource, timeout: number, retries: number): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = attempt === 0 ? resource.url : (resource.fallbackUrl || resource.url)
        await this.loadFromUrl(resource, url, timeout)
        return
      } catch (error) {
        lastError = error as Error
        if (attempt < retries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        }
      }
    }

    throw lastError || new Error(`Failed to load resource: ${resource.name}`)
  }

  private async loadFromUrl(resource: CDNResource, url: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout loading resource: ${resource.name}`))
      }, timeout)

      const cleanup = () => {
        clearTimeout(timeoutId)
      }

      if (resource.type === 'script') {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        
        if (resource.integrity) {
          script.integrity = resource.integrity
        }
        
        if (resource.crossorigin) {
          script.crossOrigin = resource.crossorigin
        }

        script.onload = () => {
          cleanup()
          resolve()
        }

        script.onerror = () => {
          cleanup()
          reject(new Error(`Failed to load script: ${url}`))
        }

        document.head.appendChild(script)

      } else if (resource.type === 'style') {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        
        if (resource.integrity) {
          link.integrity = resource.integrity
        }
        
        if (resource.crossorigin) {
          link.crossOrigin = resource.crossorigin
        }

        link.onload = () => {
          cleanup()
          resolve()
        }

        link.onerror = () => {
          cleanup()
          reject(new Error(`Failed to load stylesheet: ${url}`))
        }

        document.head.appendChild(link)

      } else if (resource.type === 'module') {
        import(url)
          .then(() => {
            cleanup()
            resolve()
          })
          .catch((error) => {
            cleanup()
            reject(error)
          })
      }
    })
  }
}

// Global instance
export const cdnResourceLoader = new CDNResourceLoader()

// Convenience functions
export const loadScript = (name: string, url: string, options?: LoadOptions) =>
  cdnResourceLoader.loadResource({ name, url, type: 'script' }, options)

export const loadStyle = (name: string, url: string, options?: LoadOptions) =>
  cdnResourceLoader.loadResource({ name, url, type: 'style' }, options)

export const loadModule = (name: string, url: string, options?: LoadOptions) =>
  cdnResourceLoader.loadResource({ name, url, type: 'module' }, options)