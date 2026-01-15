/**
 * CDN Resource Loader
 * Handles loading of resources from CDN with fallback mechanisms
 */

import { getCDNResource, type CDNResource as ConfigCDNResource } from '@/config/cdnResources'

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
  onProgress?: (progress: { percentage: number; status?: string }) => void
}

class CDNResourceLoader {
  private loadedResources = new Set<string>()
  private loadingPromises = new Map<string, Promise<void>>()

  /**
   * Load a resource from CDN
   * Supports both CDNResource object and resource name (string)
   */
  async loadResource(
    resourceOrName: CDNResource | string, 
    options: LoadOptions = {}
  ): Promise<any> {
    // If string, get resource from config
    let resource: CDNResource
    if (typeof resourceOrName === 'string') {
      const configResource = getCDNResource(resourceOrName)
      if (!configResource) {
        throw new Error(`CDN resource not found: ${resourceOrName}`)
      }
      
      // Convert config resource to loader resource format
      resource = {
        name: configResource.name,
        url: configResource.url,
        fallbackUrl: configResource.fallback,
        type: configResource.type === 'script' ? 'script' : 
              configResource.type === 'style' ? 'style' : 'module',
        integrity: configResource.integrity,
        crossorigin: configResource.integrity ? 'anonymous' : undefined
      }
    } else {
      resource = resourceOrName
    }

    const { timeout = 10000, retries = 2, cache = true } = options

    // Check if already loaded
    if (cache && this.loadedResources.has(resource.name)) {
      // Return global variable if available
      if (resource.type === 'script') {
        const configResource = getCDNResource(resource.name)
        if (configResource?.globalName) {
          return (window as any)[configResource.globalName]
        }
      }
      return
    }

    // Check if currently loading
    if (this.loadingPromises.has(resource.name)) {
      return this.loadingPromises.get(resource.name)!
    }

    // Start loading
    const loadPromise = this.doLoadResource(resource, timeout, retries, options.onProgress)
    this.loadingPromises.set(resource.name, loadPromise)

    try {
      await loadPromise
      if (cache) {
        this.loadedResources.add(resource.name)
      }
      
      // Return global variable for script resources
      if (resource.type === 'script') {
        const configResource = getCDNResource(resource.name)
        if (configResource?.globalName) {
          return (window as any)[configResource.globalName]
        }
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

  private async doLoadResource(
    resource: CDNResource, 
    timeout: number, 
    retries: number,
    onProgress?: (progress: { percentage: number; status?: string }) => void
  ): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = attempt === 0 ? resource.url : (resource.fallbackUrl || resource.url)
        onProgress?.({
          percentage: (attempt / (retries + 1)) * 100,
          status: `Loading ${resource.name}... (attempt ${attempt + 1}/${retries + 1})`
        })
        await this.loadFromUrl(resource, url, timeout)
        onProgress?.({
          percentage: 100,
          status: `${resource.name} loaded successfully`
        })
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
        cleanup()
        // 清理已创建的 DOM 元素
        if (resource.type === 'script') {
          const scripts = document.head.querySelectorAll(`script[src="${url}"]`)
          scripts.forEach(s => s.parentNode?.removeChild(s))
        } else if (resource.type === 'style') {
          const links = document.head.querySelectorAll(`link[href="${url}"]`)
          links.forEach(l => l.parentNode?.removeChild(l))
        }
        reject(new Error(`Timeout loading resource: ${resource.name}`))
      }, timeout)

      const cleanup = () => {
        clearTimeout(timeoutId)
      }

      if (resource.type === 'script') {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        
        // SRI (Subresource Integrity) 验证
        // 如果设置了 integrity，必须设置 crossOrigin 为 'anonymous' 才能生效
        if (resource.integrity) {
          script.integrity = resource.integrity
          script.crossOrigin = 'anonymous' // 必须设置才能验证 integrity
        } else if (resource.crossorigin) {
          script.crossOrigin = resource.crossorigin
        }

        script.onload = () => {
          cleanup()
          resolve()
        }

        script.onerror = () => {
          cleanup()
          // 清理已创建的 script 标签，避免内存泄漏
          if (script.parentNode) {
            script.parentNode.removeChild(script)
          }
          reject(new Error(`Failed to load script: ${url}`))
        }

        document.head.appendChild(script)

      } else if (resource.type === 'style') {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        
        // SRI (Subresource Integrity) 验证
        // 如果设置了 integrity，必须设置 crossOrigin 为 'anonymous' 才能生效
        if (resource.integrity) {
          link.integrity = resource.integrity
          link.crossOrigin = 'anonymous' // 必须设置才能验证 integrity
        } else if (resource.crossorigin) {
          link.crossOrigin = resource.crossorigin
        }

        link.onload = () => {
          cleanup()
          resolve()
        }

        link.onerror = () => {
          cleanup()
          // 清理已创建的 link 标签，避免内存泄漏
          if (link.parentNode) {
            link.parentNode.removeChild(link)
          }
          reject(new Error(`Failed to load stylesheet: ${url}`))
        }

        document.head.appendChild(link)

      } else if (resource.type === 'module') {
        // 动态 import 不支持 integrity，需要先验证 URL 白名单
        // 检查 URL 是否在允许的 CDN 域名列表中
        try {
          const urlObj = new URL(url)
          const allowedDomains = [
            'cdn.jsdelivr.net',
            'unpkg.com',
            'esm.sh',
            'cdn.skypack.dev'
          ]
          
          if (!allowedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain))) {
            reject(new Error(`Module import from unauthorized domain: ${urlObj.hostname}`))
            return
          }
        } catch (e) {
          reject(new Error(`Invalid module URL: ${url}`))
          return
        }
        
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