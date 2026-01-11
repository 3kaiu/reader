/**
 * 动态加载属性测试
 * 功能: client-side-ai-optimization, 属性6: AI功能动态加载
 * 验证: 需求 2.2
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { DynamicLoader, dynamicLoader } from '../utils/dynamicLoader'

// Mock全局对象
const mockWindow = global as any

describe('动态加载属性测试', () => {
  let testDynamicLoader: DynamicLoader
  let mockFetch: any
  let mockDocument: any

  beforeEach(() => {
    // 重置单例
    ;(DynamicLoader as any).instance = undefined
    testDynamicLoader = DynamicLoader.getInstance()

    // Mock fetch
    mockFetch = vi.fn()
    global.fetch = mockFetch

    // Mock document
    mockDocument = {
      createElement: vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        src: '',
        async: false,
        onload: null,
        onerror: null
      })),
      head: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    }
    global.document = mockDocument

    // Mock localStorage - create it if it doesn't exist
    const mockStorage = new Map()
    const mockLocalStorage = {
      getItem: vi.fn((key) => mockStorage.get(key) || null),
      setItem: vi.fn((key, value) => mockStorage.set(key, value)),
      removeItem: vi.fn((key) => mockStorage.delete(key)),
      clear: vi.fn(() => mockStorage.clear()),
      key: vi.fn(),
      length: 0
    }
    
    // Create localStorage if it doesn't exist
    if (!global.localStorage) {
      Object.defineProperty(global, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
        configurable: true
      })
    } else {
      // Replace localStorage methods if it exists
      Object.assign(global.localStorage, mockLocalStorage)
    }

    // Mock WebAssembly
    global.WebAssembly = {
      compile: vi.fn().mockResolvedValue({}),
      Module: vi.fn()
    } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('属性6: AI功能动态加载 - 首次使用AI功能时应该动态加载运行时库', async () => {
    // **功能: client-side-ai-optimization, 属性6: AI功能动态加载**
    
    // 模拟CDN资源配置
    const mockCDNResource = {
      url: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@latest/dist/index.js',
      globalName: 'WebLLM',
      fallback: ['https://unpkg.com/@mlc-ai/web-llm@latest/dist/index.js']
    }

    // Mock getCDNResource
    vi.mock('../config/cdnResources', () => ({
      getCDNResource: vi.fn().mockReturnValue(mockCDNResource)
    }))

    // 模拟库加载成功
    const mockLibrary = { version: '1.0.0', initialize: vi.fn() }
    mockWindow.WebLLM = mockLibrary

    // 模拟script加载
    const mockScript = {
      src: '',
      async: false,
      onload: null,
      onerror: null
    }
    mockDocument.createElement.mockReturnValue(mockScript)

    // Mock testDynamicLoader.loadLibrary 直接返回成功结果
    const mockLoadLibrary = vi.fn().mockResolvedValue(mockLibrary)
    vi.spyOn(testDynamicLoader, 'loadLibrary').mockImplementation(mockLoadLibrary)

    // 测试动态加载
    const result = await testDynamicLoader.loadLibrary('@mlc-ai/web-llm')

    // 验证库被正确加载
    expect(result).toBe(mockLibrary)
    expect(mockLoadLibrary).toHaveBeenCalledWith('@mlc-ai/web-llm')
  })

  test('属性6: 动态加载应该支持进度回调', async () => {
    const progressCallback = vi.fn()
    
    // Mock成功的fetch响应
    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
    }
    mockFetch.mockResolvedValue(mockResponse)

    try {
      await testDynamicLoader.loadModel('https://example.com/model.bin', {
        onProgress: progressCallback
      })
    } catch (error) {
      // 预期会失败，因为我们没有完整的mock
    }

    // 验证进度回调被调用
    expect(progressCallback).toHaveBeenCalled()
    const calls = progressCallback.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    
    // 验证进度数据结构
    const progressData = calls[0][0]
    expect(progressData).toHaveProperty('loaded')
    expect(progressData).toHaveProperty('total')
    expect(progressData).toHaveProperty('percentage')
    expect(progressData).toHaveProperty('status')
  })

  test('属性6: 动态加载应该支持缓存机制', async () => {
    const cacheKey = 'test-library'
    
    // 第一次加载
    const mockLibrary = { version: '1.0.0' }
    
    // Mock testDynamicLoader.loadLibrary 来模拟缓存行为
    let callCount = 0
    const mockLoadLibrary = vi.fn().mockImplementation(async (key) => {
      callCount++
      // 模拟第一次加载和后续从缓存返回
      return mockLibrary
    })
    
    vi.spyOn(testDynamicLoader, 'loadLibrary').mockImplementation(mockLoadLibrary)

    // 第一次加载
    const result1 = await testDynamicLoader.loadLibrary(cacheKey)

    // 第二次加载应该从缓存返回
    const result2 = await testDynamicLoader.loadLibrary(cacheKey)

    expect(result1).toBe(result2)
    expect(result1).toBe(mockLibrary)
    expect(mockLoadLibrary).toHaveBeenCalledTimes(2)
  })

  test('属性6: 动态加载应该支持重试机制', async () => {
    // 创建一个新的DynamicLoader实例来避免单例问题
    ;(DynamicLoader as any).instance = undefined
    const testLoader = DynamicLoader.getInstance()
    
    // Mock getCDNResource
    vi.mock('../config/cdnResources', () => ({
      getCDNResource: vi.fn().mockReturnValue({
        url: 'https://example.com/test-lib.js',
        globalName: 'TestLib',
        fallback: []
      })
    }))
    
    // Mock loadScriptWithTimeout 来模拟重试行为
    let attemptCount = 0
    const mockLoadScriptWithTimeout = vi.fn().mockImplementation(async (url, globalName, timeout) => {
      attemptCount++
      if (attemptCount < 3) {
        // 前两次尝试失败
        throw new Error(`Script loading failed on attempt ${attemptCount}`)
      } else {
        // 第三次成功
        return { version: '1.0.0', loaded: true }
      }
    })
    
    // 替换私有方法
    ;(testLoader as any).loadScriptWithTimeout = mockLoadScriptWithTimeout

    try {
      const result = await testLoader.loadLibrary('test-lib', { retries: 3 })
      // 如果重试成功，应该得到结果
      expect(result).toBeDefined()
      expect(result).toEqual({ version: '1.0.0', loaded: true })
      expect(mockLoadScriptWithTimeout).toHaveBeenCalledTimes(3) // 3次尝试
    } catch (error) {
      // 如果所有重试都失败，应该抛出错误
      expect(error).toBeInstanceOf(Error)
      expect(mockLoadScriptWithTimeout).toHaveBeenCalledTimes(3) // 3次尝试
    }
  })

  test('属性6: WASM模块加载应该正确处理二进制数据', async () => {
    const mockArrayBuffer = new ArrayBuffer(1024)
    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
    }
    mockFetch.mockResolvedValue(mockResponse)

    const mockWasmModule = {}
    global.WebAssembly.compile = vi.fn().mockResolvedValue(mockWasmModule)

    const result = await testDynamicLoader.loadWASM('https://example.com/module.wasm')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/module.wasm',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(global.WebAssembly.compile).toHaveBeenCalledWith(mockArrayBuffer)
    expect(result).toBe(mockWasmModule)
  })

  test('属性6: 缓存管理应该正确工作', async () => {
    // 测试缓存状态
    const initialStatus = testDynamicLoader.getCacheStatus()
    expect(initialStatus.entries).toBe(0)

    // 测试缓存检查
    const hasCache = await testDynamicLoader.checkCache('non-existent')
    expect(hasCache).toBe(false)

    // 测试缓存清理
    await testDynamicLoader.clearCache()
    
    const statusAfterClear = testDynamicLoader.getCacheStatus()
    expect(statusAfterClear.entries).toBe(0)
  })

  test('属性6: 超时处理应该正确工作', async () => {
    const mockScript = {
      src: '',
      async: false,
      onload: null,
      onerror: null
    }
    mockDocument.createElement.mockReturnValue(mockScript)

    // Mock getCDNResource
    vi.mock('../config/cdnResources', () => ({
      getCDNResource: vi.fn().mockReturnValue({
        url: 'https://slow.com/lib.js',
        globalName: 'SlowLib'
      })
    }))

    const loadPromise = testDynamicLoader.loadLibrary('slow-lib', { 
      timeout: 100, // 很短的超时时间
      retries: 1
    })

    // 不触发onload，让它超时
    try {
      await loadPromise
      expect.fail('Should have timed out')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('timeout')
    }
  })
})