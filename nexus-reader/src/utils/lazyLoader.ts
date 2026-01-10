/**
 * Lazy Loader - 功能模块按需加载工具
 * 提供智能的组件和功能模块懒加载机制
 */

import { defineAsyncComponent, type AsyncComponentLoader, type Component } from 'vue'

// 加载状态接口
export interface LoadingState {
  isLoading: boolean
  error: Error | null
  retryCount: number
}

// 懒加载配置
export interface LazyLoadConfig {
  loadingComponent?: Component
  errorComponent?: Component
  delay?: number
  timeout?: number
  maxRetries?: number
  suspensible?: boolean
  onError?: (error: Error, retry: () => void, fail: () => void) => void
}

// 功能模块缓存
const moduleCache = new Map<string, Promise<any>>()
const loadingStates = new Map<string, LoadingState>()

// 默认配置
const DEFAULT_CONFIG: Required<LazyLoadConfig> = {
  loadingComponent: {
    template: '<div class="loading-spinner">加载中...</div>'
  },
  errorComponent: {
    template: '<div class="error-message">加载失败，请重试</div>'
  },
  delay: 200,
  timeout: 30000,
  maxRetries: 3,
  suspensible: false,
  onError: (error, retry, fail) => {
    console.error('Component loading failed:', error)
    retry()
  }
}

/**
 * 创建懒加载组件
 */
export function createLazyComponent(
  loader: AsyncComponentLoader,
  config: LazyLoadConfig = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  return defineAsyncComponent({
    loader,
    loadingComponent: finalConfig.loadingComponent,
    errorComponent: finalConfig.errorComponent,
    delay: finalConfig.delay,
    timeout: finalConfig.timeout,
    suspensible: finalConfig.suspensible,
    onError: finalConfig.onError
  })
}

/**
 * AI 功能模块懒加载器
 */
export class AIModuleLoader {
  private static instance: AIModuleLoader
  private loadedModules = new Set<string>()

  static getInstance(): AIModuleLoader {
    if (!AIModuleLoader.instance) {
      AIModuleLoader.instance = new AIModuleLoader()
    }
    return AIModuleLoader.instance
  }

  // 加载 ONNX Runtime
  async loadONNXRuntime() {
    const moduleKey = 'onnxruntime-web'
    
    if (this.loadedModules.has(moduleKey)) {
      return moduleCache.get(moduleKey)
    }

    const loadPromise = this.loadWithRetry(
      () => import('onnxruntime-web'),
      moduleKey,
      'ONNX Runtime'
    )

    moduleCache.set(moduleKey, loadPromise)
    return loadPromise
  }

  // 加载 Hugging Face Transformers
  async loadTransformers() {
    const moduleKey = '@huggingface/transformers'
    
    if (this.loadedModules.has(moduleKey)) {
      return moduleCache.get(moduleKey)
    }

    const loadPromise = this.loadWithRetry(
      () => import('@huggingface/transformers'),
      moduleKey,
      'Hugging Face Transformers'
    )

    moduleCache.set(moduleKey, loadPromise)
    return loadPromise
  }

  // 预加载 AI 模块（在空闲时间）
  preloadAIModules() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        this.loadONNXRuntime().catch(console.error)
        this.loadTransformers().catch(console.error)
      })
    } else {
      // 降级到 setTimeout
      setTimeout(() => {
        this.loadONNXRuntime().catch(console.error)
        this.loadTransformers().catch(console.error)
      }, 2000)
    }
  }

  private async loadWithRetry(
    loader: () => Promise<any>,
    moduleKey: string,
    moduleName: string,
    maxRetries = 3
  ): Promise<any> {
    let retryCount = 0
    
    const loadingState: LoadingState = {
      isLoading: true,
      error: null,
      retryCount: 0
    }
    loadingStates.set(moduleKey, loadingState)

    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Loading ${moduleName}... (attempt ${retryCount + 1})`)
        const startTime = performance.now()
        
        const module = await loader()
        
        const loadTime = performance.now() - startTime
        console.log(`✅ ${moduleName} loaded successfully in ${loadTime.toFixed(2)}ms`)
        
        this.loadedModules.add(moduleKey)
        loadingState.isLoading = false
        loadingState.error = null
        
        // 报告性能指标
        if (window.performanceMonitor) {
          window.performanceMonitor.reportMetric('module_load', loadTime, {
            module: moduleName,
            success: true,
            retryCount
          })
        }
        
        return module
      } catch (error) {
        retryCount++
        loadingState.retryCount = retryCount
        loadingState.error = error as Error
        
        console.error(`❌ Failed to load ${moduleName} (attempt ${retryCount}):`, error)
        
        if (retryCount >= maxRetries) {
          loadingState.isLoading = false
          
          // 报告加载失败
          if (window.performanceMonitor) {
            window.performanceMonitor.reportMetric('module_load_error', 1, {
              module: moduleName,
              error: (error as Error).message,
              retryCount
            })
          }
          
          throw new Error(`Failed to load ${moduleName} after ${maxRetries} attempts: ${(error as Error).message}`)
        }
        
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // 获取模块加载状态
  getLoadingState(moduleKey: string): LoadingState | null {
    return loadingStates.get(moduleKey) || null
  }

  // 检查模块是否已加载
  isModuleLoaded(moduleKey: string): boolean {
    return this.loadedModules.has(moduleKey)
  }
}

/**
 * TTS 功能模块懒加载器
 */
export class TTSModuleLoader {
  private static instance: TTSModuleLoader
  private loadedModules = new Set<string>()

  static getInstance(): TTSModuleLoader {
    if (!TTSModuleLoader.instance) {
      TTSModuleLoader.instance = new TTSModuleLoader()
    }
    return TTSModuleLoader.instance
  }

  // 加载 Piper TTS
  async loadPiperTTS() {
    const moduleKey = 'piper-tts-web'
    
    if (this.loadedModules.has(moduleKey)) {
      return moduleCache.get(moduleKey)
    }

    const loadPromise = this.loadWithRetry(
      () => import('piper-tts-web'),
      moduleKey,
      'Piper TTS'
    )

    moduleCache.set(moduleKey, loadPromise)
    return loadPromise
  }

  // 预加载 TTS 模块
  preloadTTSModules() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        this.loadPiperTTS().catch(console.error)
      })
    } else {
      setTimeout(() => {
        this.loadPiperTTS().catch(console.error)
      }, 3000)
    }
  }

  private async loadWithRetry(
    loader: () => Promise<any>,
    moduleKey: string,
    moduleName: string,
    maxRetries = 3
  ): Promise<any> {
    let retryCount = 0
    
    const loadingState: LoadingState = {
      isLoading: true,
      error: null,
      retryCount: 0
    }
    loadingStates.set(moduleKey, loadingState)

    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Loading ${moduleName}... (attempt ${retryCount + 1})`)
        const startTime = performance.now()
        
        const module = await loader()
        
        const loadTime = performance.now() - startTime
        console.log(`✅ ${moduleName} loaded successfully in ${loadTime.toFixed(2)}ms`)
        
        this.loadedModules.add(moduleKey)
        loadingState.isLoading = false
        loadingState.error = null
        
        // 报告性能指标
        if (window.performanceMonitor) {
          window.performanceMonitor.reportMetric('module_load', loadTime, {
            module: moduleName,
            success: true,
            retryCount
          })
        }
        
        return module
      } catch (error) {
        retryCount++
        loadingState.retryCount = retryCount
        loadingState.error = error as Error
        
        console.error(`❌ Failed to load ${moduleName} (attempt ${retryCount}):`, error)
        
        if (retryCount >= maxRetries) {
          loadingState.isLoading = false
          
          // 报告加载失败
          if (window.performanceMonitor) {
            window.performanceMonitor.reportMetric('module_load_error', 1, {
              module: moduleName,
              error: (error as Error).message,
              retryCount
            })
          }
          
          throw new Error(`Failed to load ${moduleName} after ${maxRetries} attempts: ${(error as Error).message}`)
        }
        
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // 获取模块加载状态
  getLoadingState(moduleKey: string): LoadingState | null {
    return loadingStates.get(moduleKey) || null
  }

  // 检查模块是否已加载
  isModuleLoaded(moduleKey: string): boolean {
    return this.loadedModules.has(moduleKey)
  }
}

/**
 * 智能预加载管理器
 */
export class PreloadManager {
  private static instance: PreloadManager
  private preloadQueue: Array<() => Promise<any>> = []
  private isPreloading = false

  static getInstance(): PreloadManager {
    if (!PreloadManager.instance) {
      PreloadManager.instance = new PreloadManager()
    }
    return PreloadManager.instance
  }

  // 添加预加载任务
  addPreloadTask(task: () => Promise<any>) {
    this.preloadQueue.push(task)
    this.processQueue()
  }

  // 基于用户行为预加载
  preloadBasedOnUserBehavior() {
    // 检查用户是否访问过 AI 相关页面
    const hasVisitedAI = localStorage.getItem('visited_ai_pages')
    if (hasVisitedAI) {
      this.addPreloadTask(() => AIModuleLoader.getInstance().preloadAIModules())
    }

    // 检查用户是否使用过 TTS 功能
    const hasUsedTTS = localStorage.getItem('used_tts_feature')
    if (hasUsedTTS) {
      this.addPreloadTask(() => TTSModuleLoader.getInstance().preloadTTSModules())
    }
  }

  // 基于网络条件预加载
  preloadBasedOnNetwork() {
    const connection = (navigator as any).connection
    if (connection) {
      // 只在快速网络下预加载大模块
      if (connection.effectiveType === '4g' && !connection.saveData) {
        this.preloadBasedOnUserBehavior()
      }
    } else {
      // 降级策略：延迟预加载
      setTimeout(() => {
        this.preloadBasedOnUserBehavior()
      }, 5000)
    }
  }

  private async processQueue() {
    if (this.isPreloading || this.preloadQueue.length === 0) return

    this.isPreloading = true

    while (this.preloadQueue.length > 0) {
      const task = this.preloadQueue.shift()!
      try {
        await task()
      } catch (error) {
        console.error('Preload task failed:', error)
      }
      
      // 在任务之间添加小延迟，避免阻塞主线程
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.isPreloading = false
  }
}

// 全局实例
export const aiLoader = AIModuleLoader.getInstance()
export const ttsLoader = TTSModuleLoader.getInstance()
export const preloadManager = PreloadManager.getInstance()

// 便捷函数
export function createAIComponent(loader: AsyncComponentLoader) {
  return createLazyComponent(loader, {
    loadingComponent: {
      template: '<div class="ai-loading">🤖 AI 模块加载中...</div>'
    },
    errorComponent: {
      template: '<div class="ai-error">❌ AI 模块加载失败</div>'
    },
    timeout: 60000, // AI 模块可能需要更长时间
  })
}

export function createTTSComponent(loader: AsyncComponentLoader) {
  return createLazyComponent(loader, {
    loadingComponent: {
      template: '<div class="tts-loading">🔊 语音模块加载中...</div>'
    },
    errorComponent: {
      template: '<div class="tts-error">❌ 语音模块加载失败</div>'
    },
    timeout: 45000,
  })
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}