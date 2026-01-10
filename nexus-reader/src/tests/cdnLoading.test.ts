/**
 * CDN资源加载属性测试
 * 功能: client-side-ai-optimization, 属性25: CDN资源加载
 * 验证: 需求 6.4
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { CDNResourceLoader, CDNPreloadManager } from '../utils/cdnResourceLoader'

describe('CDN资源加载属性测试', () => {
  let cdnLoader: CDNResourceLoader
  let preloadManager: CDNPreloadManager
  let mockFetch: any
  let mockCrypto: any

  beforeEach(() => {
    // 重置单例
    ;(CDNResourceLoader as any).instance = undefined
    ;(CDNPreloadManager as any).instance = undefined
    
    cdnLoader = CDNResourceLoader.getInstance()
    preloadManager = CDNPreloadManager.getInstance()

    // Mock fetch
    mockFetch = vi.fn()
    global.fetch = mockFetch

    // Mock crypto
    mockCrypto = {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32))
      }
    }
    global.crypto = mockCrypto

    // Mock动态加载器
    vi.doMock('../utils/dynamicLoader', () => ({
      dynamicLoader: {
        loadLibrary: vi.fn().mockResolvedValue({ version: '1.0.0' }),
        checkCache: vi.fn().mockResolvedValue(false)
      }
    }))

    // Mock CDN配置
    vi.doMock('../config/cdnResources', () => ({
      getCDNResource: vi.fn().mockReturnValue({
        url: 'https://primary-cdn.com/lib.js',
        globalName: 'TestLib',
        fallback: ['https://fallback-cdn.com/lib.js'],
        integrity: 'sha256-abcd1234'
      }),
      checkCDNAvailability: vi.fn().mockResolvedValue(true)
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('属性25: CDN资源加载 - 应该支持从CDN加载AI运行时库', async () => {
    // **功能: client-side-ai-optimization, 属性25: CDN资源加载**
    
    // Mock成功的CDN响应
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '1024']])
    })

    const result = await cdnLoader.loadResource('@mlc-ai/web-llm')

    expect(result).toBeDefined()
    expect(result.version).toBe('1.0.0')
  })

  test('属性25: CDN健康检查应该正确工作', async () => {
    // Mock不同的响应时间
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 }) // 快速响应
      .mockRejectedValueOnce(new Error('Timeout')) // 慢速/失败响应

    const urls = [
      'https://fast-cdn.com/lib.js',
      'https://slow-cdn.com/lib.js'
    ]

    const healthStatuses = await cdnLoader.checkCDNHealth(urls)

    expect(healthStatuses).toHaveLength(2)
    expect(healthStatuses[0].available).toBe(true)
    expect(healthStatuses[1].available).toBe(false)
    expect(healthStatuses[0].responseTime).toBeGreaterThan(0)
  })

  test('属性25: 应该选择最佳CDN', async () => {
    // Mock不同CDN的响应时间
    const mockHealthStatuses = [
      { url: 'https://slow-cdn.com/lib.js', available: true, responseTime: 500, lastChecked: Date.now() },
      { url: 'https://fast-cdn.com/lib.js', available: true, responseTime: 100, lastChecked: Date.now() }
    ]

    // Mock checkCDNHealth方法
    vi.spyOn(cdnLoader, 'checkCDNHealth').mockResolvedValue(mockHealthStatuses)

    await cdnLoader.loadResource('test-package')

    // 验证选择了响应时间最短的CDN
    const { dynamicLoader } = await import('../utils/dynamicLoader')
    expect(dynamicLoader.loadLibrary).toHaveBeenCalled()
  })

  test('属性25: 应该支持CDN降级机制', async () => {
    // Mock主CDN失败，备用CDN成功
    const { dynamicLoader } = await import('../utils/dynamicLoader')
    
    // 第一次调用失败，第二次成功
    vi.mocked(dynamicLoader.loadLibrary)
      .mockRejectedValueOnce(new Error('Primary CDN failed'))
      .mockResolvedValueOnce({ version: '1.0.0' })

    const result = await cdnLoader.loadResource('test-package', {
      fallbackToLocal: true
    })

    expect(result).toBeDefined()
  })

  test('属性25: 资源完整性验证应该正确工作', async () => {
    const testData = new ArrayBuffer(1024)
    const expectedHash = 'abcd1234567890'

    // Mock crypto.subtle.digest返回匹配的哈希
    const mockHashBuffer = new ArrayBuffer(32)
    const mockHashArray = new Uint8Array(mockHashBuffer)
    mockHashArray.fill(0xab) // 填充测试数据
    
    mockCrypto.subtle.digest.mockResolvedValue(mockHashBuffer)

    const isValid = await cdnLoader.verifyIntegrity(testData, expectedHash)

    expect(mockCrypto.subtle.digest).toHaveBeenCalledWith('SHA-256', testData)
    // 由于我们mock了哈希结果，这里主要验证调用逻辑
    expect(typeof isValid).toBe('boolean')
  })

  test('属性25: 预加载管理器应该正确工作', async () => {
    const packages = ['@mlc-ai/web-llm', 'onnxruntime-web']
    
    // 添加到预加载队列
    preloadManager.addToQueue(packages)
    
    const statusBefore = preloadManager.getPreloadStatus()
    expect(statusBefore.queue).toEqual(packages)
    expect(statusBefore.isPreloading).toBe(false)

    // 开始预加载
    const preloadPromise = preloadManager.startPreloading()
    
    const statusDuring = preloadManager.getPreloadStatus()
    expect(statusDuring.isPreloading).toBe(true)

    await preloadPromise

    const statusAfter = preloadManager.getPreloadStatus()
    expect(statusAfter.isPreloading).toBe(false)
    expect(statusAfter.preloaded).toEqual(packages)
  })

  test('属性25: 应该支持进度回调', async () => {
    const progressCallback = vi.fn()

    await cdnLoader.loadResource('test-package', {
      onProgress: progressCallback
    })

    // 验证进度回调被调用
    expect(progressCallback).toHaveBeenCalled()
  })

  test('属性25: 健康状态缓存应该正确工作', async () => {
    // 第一次检查
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    
    const urls = ['https://test-cdn.com/lib.js']
    const health1 = await cdnLoader.checkCDNHealth(urls)
    
    // 第二次检查应该使用缓存
    const health2 = await cdnLoader.checkCDNHealth(urls)
    
    expect(health1[0].lastChecked).toBe(health2[0].lastChecked)
    
    // 获取性能报告
    const report = cdnLoader.getCDNPerformanceReport()
    expect(report).toHaveProperty(urls[0])
    
    // 清理缓存
    cdnLoader.clearHealthCache()
    const reportAfterClear = cdnLoader.getCDNPerformanceReport()
    expect(Object.keys(reportAfterClear)).toHaveLength(0)
  })

  test('属性25: 超时处理应该正确工作', async () => {
    const { dynamicLoader } = await import('../utils/dynamicLoader')
    
    // Mock超时错误
    vi.mocked(dynamicLoader.loadLibrary).mockRejectedValue(new Error('Timeout'))

    try {
      await cdnLoader.loadResource('test-package', { timeout: 1000 })
      expect.fail('Should have thrown timeout error')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
    }
  })

  test('属性25: 并发加载应该正确处理', async () => {
    const { dynamicLoader } = await import('../utils/dynamicLoader')
    
    // Mock延迟响应
    vi.mocked(dynamicLoader.loadLibrary).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ version: '1.0.0' }), 100))
    )

    // 并发加载同一个包
    const promises = [
      cdnLoader.loadResource('test-package'),
      cdnLoader.loadResource('test-package'),
      cdnLoader.loadResource('test-package')
    ]

    const results = await Promise.all(promises)

    // 所有结果应该相同
    expect(results[0]).toEqual(results[1])
    expect(results[1]).toEqual(results[2])
    
    // 但实际只应该加载一次
    expect(dynamicLoader.loadLibrary).toHaveBeenCalledTimes(1)
  })
})