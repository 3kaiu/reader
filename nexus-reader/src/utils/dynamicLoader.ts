/**
 * 动态加载器 - 端侧AI优化核心组件
 * 负责运行时动态加载AI库、WASM模块和模型文件
 */

import { getCDNResource, type CDNResource } from '@/config/cdnResources'

export interface LoadProgress {
  loaded: number
  total: number
  percentage: number
  status: string
}

export interface LoadOptions {
  timeout?: number
  retries?: number
  onProgress?: (progress: LoadProgress) => void
  integrity?: string
  cache?: boolean
}

export interface CacheEntry {
  data: any
  timestamp: number
  size: number
  version?: string
  integrity?: string
}

/**
 * 动态加载器类
 */
export class DynamicLoader {
  private static instance: DynamicLoader
  private loadedLibraries = new Map<string, any>()
  private loadingPromises = new Map<string, Promise<any>>()
  private cache = new Map<string, CacheEntry>()
  private readonly CACHE_PREFIX = 'dynamic-loader-'
  private readonly DEFAULT_TIMEOUT = 30000 // 30秒
  private readonly DEFAULT_RETRIES = 3

  private constructor() {
    this.initializeCache()
  }

  static getInstance(): DynamicLoader {
    if (!DynamicLoader.instance) {
      DynamicLoader.instance = new DynamicLoader()
    }
    return DynamicLoader.instance
  }

  /**
   * 初始化缓存系统
   */
  private async initializeCache(): Promise<void> {
    try {
      // 从localStorage恢复缓存元数据
      const cacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.CACHE_PREFIX)
      )
      
      for (const key of cacheKeys) {
        try {
          const cacheData = JSON.parse(localStorage.getItem(key) || '{}')
          const cacheKey = key.replace(this.CACHE_PREFIX, '')
          
          // 检查缓存是否过期（24小时）
          const isExpired = Date.now() - cacheData.timestamp > 24 * 60 * 60 * 1000
          if (isExpired) {
            localStorage.removeItem(key)
            continue
          }
          
          this.cache.set(cacheKey, cacheData)
        } catch (error) {
          console.warn(`Failed to restore cache for ${key}:`, error)
          localStorage.removeItem(key)
        }
      }
    } catch (error) {
      console.warn('Failed to initialize cache:', error)
    }
  }

  /**
   * 加载外部库
   */
  async loadLibrary(packageName: string, options: LoadOptions = {}): Promise<any> {
    // 如果已经加载，直接返回
    if (this.loadedLibraries.has(packageName)) {
      return this.loadedLibraries.get(packageName)
    }

    // 如果正在加载，返回现有的Promise
    if (this.loadingPromises.has(packageName)) {
      return this.loadingPromises.get(packageName)
    }

    // 创建加载Promise
    const loadPromise = this.doLoadLibrary(packageName, options)
    this.loadingPromises.set(packageName, loadPromise)

    try {
      const result = await loadPromise
      this.loadedLibraries.set(packageName, result)
      return result
    } finally {
      this.loadingPromises.delete(packageName)
    }
  }

  /**
   * 执行库加载
   */
  private async doLoadLibrary(packageName: string, options: LoadOptions): Promise<any> {
    const cdnResource = getCDNResource(packageName)
    if (!cdnResource) {
      throw new Error(`No CDN resource configured for ${packageName}`)
    }

    // 检查缓存
    if (options.cache !== false) {
      const cached = this.getCachedLibrary(packageName)
      if (cached) {
        options.onProgress?.({
          loaded: 1,
          total: 1,
          percentage: 100,
          status: 'Loaded from cache'
        })
        return cached
      }
    }

    const timeout = options.timeout || this.DEFAULT_TIMEOUT
    const retries = options.retries || this.DEFAULT_RETRIES

    let lastError: Error | null = null
    const urls = [cdnResource.url, ...(cdnResource.fallback || [])]

    for (let attempt = 0; attempt < retries; attempt++) {
      for (const url of urls) {
        try {
          options.onProgress?.({
            loaded: 0,
            total: 1,
            percentage: 0,
            status: `Loading ${packageName} from ${new URL(url).hostname}...`
          })

          const library = await this.loadScriptWithTimeout(url, cdnResource.globalName, timeout)
          
          // 缓存成功加载的库
          if (options.cache !== false) {
            this.cacheLibrary(packageName, library, { url, integrity: options.integrity })
          }

          options.onProgress?.({
            loaded: 1,
            total: 1,
            percentage: 100,
            status: `${packageName} loaded successfully`
          })

          return library
        } catch (error) {
          lastError = error as Error
          console.warn(`Failed to load ${packageName} from ${url} (attempt ${attempt + 1}):`, error)
        }
      }

      // 重试前等待
      if (attempt < retries - 1) {
        await this.delay(1000 * Math.pow(2, attempt)) // 指数退避
      }
    }

    throw new Error(`Failed to load ${packageName} after ${retries} attempts: ${lastError?.message}`)
  }

  /**
   * 加载WASM模块
   */
  async loadWASM(url: string, options: LoadOptions = {}): Promise<WebAssembly.Module> {
    const cacheKey = `wasm-${this.hashUrl(url)}`
    
    // 检查缓存
    if (options.cache !== false) {
      const cached = this.cache.get(cacheKey)
      if (cached && cached.data instanceof WebAssembly.Module) {
        options.onProgress?.({
          loaded: 1,
          total: 1,
          percentage: 100,
          status: 'WASM loaded from cache'
        })
        return cached.data
      }
    }

    const timeout = options.timeout || this.DEFAULT_TIMEOUT
    const retries = options.retries || this.DEFAULT_RETRIES

    let lastError: Error | null = null

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        options.onProgress?.({
          loaded: 0,
          total: 1,
          percentage: 0,
          status: `Loading WASM from ${new URL(url).hostname}...`
        })

        const response = await this.fetchWithTimeout(url, timeout)
        const arrayBuffer = await response.arrayBuffer()
        
        options.onProgress?.({
          loaded: 0.5,
          total: 1,
          percentage: 50,
          status: 'Compiling WASM module...'
        })

        const module = await WebAssembly.compile(arrayBuffer)

        // 缓存WASM模块
        if (options.cache !== false) {
          this.cache.set(cacheKey, {
            data: module,
            timestamp: Date.now(),
            size: arrayBuffer.byteLength,
            integrity: options.integrity
          })
        }

        options.onProgress?.({
          loaded: 1,
          total: 1,
          percentage: 100,
          status: 'WASM module loaded successfully'
        })

        return module
      } catch (error) {
        lastError = error as Error
        console.warn(`Failed to load WASM from ${url} (attempt ${attempt + 1}):`, error)
        
        if (attempt < retries - 1) {
          await this.delay(1000 * Math.pow(2, attempt))
        }
      }
    }

    throw new Error(`Failed to load WASM from ${url} after ${retries} attempts: ${lastError?.message}`)
  }

  /**
   * 加载模型文件
   */
  async loadModel(url: string, options: LoadOptions = {}): Promise<ArrayBuffer> {
    const cacheKey = `model-${this.hashUrl(url)}`
    
    // 检查缓存
    if (options.cache !== false) {
      const cached = this.cache.get(cacheKey)
      if (cached && cached.data instanceof ArrayBuffer) {
        options.onProgress?.({
          loaded: cached.size,
          total: cached.size,
          percentage: 100,
          status: 'Model loaded from cache'
        })
        return cached.data
      }
    }

    const timeout = options.timeout || 60000 // 模型文件超时时间更长
    const retries = options.retries || this.DEFAULT_RETRIES

    let lastError: Error | null = null

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, timeout, (loaded, total) => {
          options.onProgress?.({
            loaded,
            total,
            percentage: total > 0 ? (loaded / total) * 100 : 0,
            status: `Downloading model... ${this.formatBytes(loaded)}/${this.formatBytes(total)}`
          })
        })

        const arrayBuffer = await response.arrayBuffer()

        // 缓存模型数据
        if (options.cache !== false) {
          this.cache.set(cacheKey, {
            data: arrayBuffer,
            timestamp: Date.now(),
            size: arrayBuffer.byteLength,
            integrity: options.integrity
          })
        }

        options.onProgress?.({
          loaded: arrayBuffer.byteLength,
          total: arrayBuffer.byteLength,
          percentage: 100,
          status: 'Model loaded successfully'
        })

        return arrayBuffer
      } catch (error) {
        lastError = error as Error
        console.warn(`Failed to load model from ${url} (attempt ${attempt + 1}):`, error)
        
        if (attempt < retries - 1) {
          await this.delay(2000 * Math.pow(2, attempt))
        }
      }
    }

    throw new Error(`Failed to load model from ${url} after ${retries} attempts: ${lastError?.message}`)
  }

  /**
   * 检查资源缓存
   */
  async checkCache(key: string): Promise<boolean> {
    return this.cache.has(key)
  }

  /**
   * 清理缓存
   */
  async clearCache(pattern?: string): Promise<void> {
    if (pattern) {
      // 清理匹配模式的缓存
      const keysToDelete = Array.from(this.cache.keys()).filter(key => 
        key.includes(pattern)
      )
      
      for (const key of keysToDelete) {
        this.cache.delete(key)
        localStorage.removeItem(this.CACHE_PREFIX + key)
      }
    } else {
      // 清理所有缓存
      this.cache.clear()
      const cacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.CACHE_PREFIX)
      )
      
      for (const key of cacheKeys) {
        localStorage.removeItem(key)
      }
    }
  }

  /**
   * 获取缓存状态
   */
  getCacheStatus(): { size: number; entries: number; totalSize: number } {
    let totalSize = 0
    for (const entry of this.cache.values()) {
      totalSize += entry.size || 0
    }

    return {
      size: this.cache.size,
      entries: this.cache.size,
      totalSize
    }
  }

  // 私有辅助方法

  private getCachedLibrary(packageName: string): any | null {
    const cached = this.cache.get(packageName)
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      return cached.data
    }
    return null
  }

  private cacheLibrary(packageName: string, library: any, metadata: { url: string; integrity?: string }): void {
    const cacheEntry: CacheEntry = {
      data: library,
      timestamp: Date.now(),
      size: JSON.stringify(library).length,
      integrity: metadata.integrity
    }

    this.cache.set(packageName, cacheEntry)
    
    try {
      localStorage.setItem(
        this.CACHE_PREFIX + packageName,
        JSON.stringify({ ...cacheEntry, data: undefined }) // 不缓存实际数据到localStorage
      )
    } catch (error) {
      console.warn(`Failed to cache ${packageName} metadata:`, error)
    }
  }

  private async loadScriptWithTimeout(url: string, globalName: string, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.async = true

      const timeoutId = setTimeout(() => {
        document.head.removeChild(script)
        reject(new Error(`Script loading timeout: ${url}`))
      }, timeout)

      script.onload = () => {
        clearTimeout(timeoutId)
        
        // 检查全局变量是否存在
        const library = (window as any)[globalName]
        if (library) {
          resolve(library)
        } else {
          reject(new Error(`Global variable ${globalName} not found after loading ${url}`))
        }
      }

      script.onerror = () => {
        clearTimeout(timeoutId)
        document.head.removeChild(script)
        reject(new Error(`Failed to load script: ${url}`))
      }

      document.head.appendChild(script)
    })
  }

  private async fetchWithTimeout(
    url: string, 
    timeout: number, 
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, { signal: controller.signal })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // 如果有进度回调，创建带进度的响应
      if (onProgress && response.body) {
        const contentLength = parseInt(response.headers.get('content-length') || '0')
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let loaded = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          chunks.push(value)
          loaded += value.length
          onProgress(loaded, contentLength)
        }

        const body = new Uint8Array(loaded)
        let offset = 0
        for (const chunk of chunks) {
          body.set(chunk, offset)
          offset += chunk.length
        }

        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        })
      }

      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private hashUrl(url: string): string {
    // 简单的URL哈希函数
    let hash = 0
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// 导出单例实例
export const dynamicLoader = DynamicLoader.getInstance()