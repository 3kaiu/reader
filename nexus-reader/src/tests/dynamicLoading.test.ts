/**
 * 动态加载属性测试
 * 功能: client-side-ai-optimization, 属性6: AI功能动态加载
 * 验证: 需求 2.2
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { DynamicLoader } from '../utils/dynamicLoader'

// Mock全局对象
const mockWindow = global as any

describe('动态加载属性测试', () => {
  let dynamicLoader: DynamicLoader
  let mockFetch: any
  let mockDocument: any

  beforeEach(() => {
    // 重置单例
    ;(DynamicLoader as any).instance = undefined
    dynamicLoader = DynamicLoader.getInstance()

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

    // Mock localStorage
    const mockStorage = new Map()
    global.localStorage = {
      getItem: vi.fn((key) => mockStorage.get(key) || null),
      setItem: vi.fn((key, value) => mockStorage.set(key, value)),
      removeItem: vi.fn((key) => mockStorage.delete(key)),
      clear: vi.fn(() => mockStorage.clear()),
      key: vi.fn(),
      length: 0
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
    vi.doMock('../config/cdnResources', () => ({
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

    // 测试动态加载
    const loadPromise = dynamicLoader.loadLibrary('@mlc-ai/web-llm')
    
    // 模拟script加载完成
    setTimeout(() => {
      if (mockScript.onload) {
        mockScript.onload()
      }
    }, 10)

    const result = await loadPromise

    // 验证库被正确加载
    expect(result).toBe(mockLibrary)
    expect(mockDocument.createElement).toHaveBeenCalledWith('script')
    expect(mockDocument.head.appendChild).toHaveBeenCalled()
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
      await dynamicLoader.loadModel('https://example.com/model.bin', {
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
    mockWindow.TestLib = mockLibrary

    const mockScript = {
      src: '',
      async: false,
      onload: null,
      onerror: null
    }
    mockDocument.createElement.mockReturnValue(mockScript)

    // Mock getCDNResource
    vi.doMock('../config/cdnResources', () => ({
      getCDNResource: vi.fn().mockReturnValue({
        url: 'https://example.com/test.js',
        globalName: 'TestLib'
      })
    }))

    const loadPromise1 = dynamicLoader.loadLibrary(cacheKey)
    
    // 模拟加载完成
    setTimeout(() => {
      if (mockScript.onload) {
        mockScript.onload()
      }
    }, 10)

    const result1 = await loadPromise1

    // 第二次加载应该从缓存返回
    const result2 = await dynamicLoader.loadLibrary(cacheKey)

    expect(result1).toBe(result2)
    expect(result1).toBe(mockLibrary)
    
    // 第二次不应该创建新的script标签
    expect(mockDocument.createElement).toHaveBeenCalledTimes(1)
  })

  test('属性6: 动态加载应该支持重试机制', async () => {
    const mockScript = {
      src: '',
      async: false,
      onload: null,
      onerror: null
    }
    mockDocument.createElement.mockReturnValue(mockScript)

    // Mock getCDNResource with fallback
    vi.doMock('../config/cdnResources', () => ({
      getCDNResource: vi.fn().mockReturnValue({
        url: 'https://primary.com/lib.js',
        globalName: 'TestLib',
        fallback: ['https://fallback.com/lib.js']
      })
    }))

    const loadPromise = dynamicLoader.loadLibrary('test-lib', { retries: 2 })

    // 模拟第一次加载失败
    setTimeout(() => {
      if (mockScript.onerror) {
        mockScript.onerror()
      }
    }, 10)

    try {
      await loadPromise
    } catch (error) {
      // 预期会失败
      expect(error).toBeInstanceOf(Error)
    }

    // 验证重试逻辑
    expect(mockDocument.createElement).toHaveBeenCalledTimes(4) // 2次重试 * 2个URL
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

    const result = await dynamicLoader.loadWASM('https://example.com/module.wasm')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/module.wasm',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(global.WebAssembly.compile).toHaveBeenCalledWith(mockArrayBuffer)
    expect(result).toBe(mockWasmModule)
  })

  test('属性6: 缓存管理应该正确工作', async () => {
    // 测试缓存状态
    const initialStatus = dynamicLoader.getCacheStatus()
    expect(initialStatus.entries).toBe(0)

    // 测试缓存检查
    const hasCache = await dynamicLoader.checkCache('non-existent')
    expect(hasCache).toBe(false)

    // 测试缓存清理
    await dynamicLoader.clearCache()
    
    const statusAfterClear = dynamicLoader.getCacheStatus()
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
    vi.doMock('../config/cdnResources', () => ({
      getCDNResource: vi.fn().mockReturnValue({
        url: 'https://slow.com/lib.js',
        globalName: 'SlowLib'
      })
    }))

    const loadPromise = dynamicLoader.loadLibrary('slow-lib', { 
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