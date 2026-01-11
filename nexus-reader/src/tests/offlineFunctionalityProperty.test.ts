/**
 * 离线功能支持属性测试
 * 验证离线模式下的功能可用性和限制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { aiErrorHandler } from '@/utils/aiErrorHandler'

// Mock dependencies
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@/utils/broadcast', () => ({
  syncChannel: {
    publish: vi.fn()
  }
}))

// Mock modelCacheManager
const mockModelCacheManager = {
  getCachedModelIds: vi.fn(),
  getCacheStats: vi.fn()
}

vi.mock('@/utils/modelCacheManager', () => ({
  modelCacheManager: mockModelCacheManager
}))

// Mock navigator
const mockNavigator = {
  onLine: true,
  connection: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 100
  }
}

Object.defineProperty(global, 'navigator', {
  value: mockNavigator,
  writable: true
})

// Mock fetch
global.fetch = vi.fn()

describe('离线功能支持属性测试 (Property 21)', () => {
  beforeEach(() => {
    // 重置所有mock
    vi.clearAllMocks()
    aiErrorHandler.clearError()
    aiErrorHandler.exitFallbackMode()
    
    // 重置navigator状态
    mockNavigator.onLine = true
    
    // 重置fetch mock
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200
    })
  })

  afterEach(() => {
    aiErrorHandler.clearError()
    aiErrorHandler.exitFallbackMode()
  })

  describe('属性1: 离线模式检测', () => {
    it('应该正确检测在线状态', async () => {
      mockNavigator.onLine = true
      
      const status = await aiErrorHandler.detectNetworkStatus()
      
      expect(status.online).toBe(true)
      expect(status.effectiveType).toBe('4g')
      expect(status.downlink).toBe(10)
      expect(status.rtt).toBe(100)
    })

    it('应该正确检测离线状态', async () => {
      mockNavigator.onLine = false
      // 当离线时，connection信息应该不可用
      delete mockNavigator.connection
      
      const status = await aiErrorHandler.detectNetworkStatus()
      
      expect(status.online).toBe(false)
      expect(status.effectiveType).toBeUndefined()
    })

    it('应该通过网络请求验证连通性', async () => {
      // 临时移除connection API以强制使用fetch验证
      const originalConnection = mockNavigator.connection
      delete mockNavigator.connection
      
      mockNavigator.onLine = true
      // 模拟网络请求失败
      ;(global.fetch as any).mockRejectedValue(new Error('Network error'))
      
      const status = await aiErrorHandler.detectNetworkStatus()
      
      // 当fetch失败时，应该返回false
      expect(status.online).toBe(false)
      expect(global.fetch).toHaveBeenCalledWith('/favicon.ico', expect.objectContaining({
        method: 'HEAD',
        cache: 'no-cache'
      }))
      
      // 恢复connection API
      mockNavigator.connection = originalConnection
    })

    it('应该处理网络检测超时', async () => {
      mockNavigator.onLine = true
      // 模拟超时
      ;(global.fetch as any).mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      )
      
      const status = await aiErrorHandler.detectNetworkStatus()
      
      // 超时时应该回退到navigator.onLine的值
      expect(status.online).toBe(true)
    })
  })

  describe('属性2: 缓存可用性检查', () => {
    it('应该正确检查离线功能可用性（有缓存模型）', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue([
        'Qwen2.5-3B-Instruct-q4f16_1-MLC',
        'tts-zh_CN-huayan-medium',
        'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
        'tts-en_US-amy-medium'
      ])
      
      mockModelCacheManager.getCacheStats.mockResolvedValue({
        totalSize: 2 * 1024 * 1024 * 1024, // 2GB
        modelCount: 4,
        oldestAccess: Date.now() - 86400000,
        newestAccess: Date.now()
      })

      const availability = await aiErrorHandler.checkOfflineAvailability()

      expect(availability.available).toBe(true)
      expect(availability.cachedModels).toEqual([
        'Qwen2.5-3B-Instruct-q4f16_1-MLC',
        'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
      ])
      expect(availability.cachedTTSModels).toEqual([
        'zh_CN-huayan-medium',
        'en_US-amy-medium'
      ])
      expect(availability.totalCacheSize).toBe(2 * 1024 * 1024 * 1024)
    })

    it('应该正确检查离线功能可用性（无缓存模型）', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue([])
      mockModelCacheManager.getCacheStats.mockResolvedValue({
        totalSize: 0,
        modelCount: 0,
        oldestAccess: Date.now(),
        newestAccess: Date.now()
      })

      const availability = await aiErrorHandler.checkOfflineAvailability()

      expect(availability.available).toBe(false)
      expect(availability.cachedModels).toEqual([])
      expect(availability.cachedTTSModels).toEqual([])
      expect(availability.totalCacheSize).toBe(0)
    })

    it('应该正确分离AI模型和TTS模型', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue([
        'tts-zh_CN-xiaoxiao-medium',
        'Qwen2.5-7B-Instruct-q4f16_1-MLC',
        'tts-en_GB-alan-medium',
        'Llama-3.2-3B-Instruct-q4f16_1-MLC'
      ])
      
      mockModelCacheManager.getCacheStats.mockResolvedValue({
        totalSize: 5 * 1024 * 1024 * 1024,
        modelCount: 4,
        oldestAccess: Date.now() - 86400000,
        newestAccess: Date.now()
      })

      const availability = await aiErrorHandler.checkOfflineAvailability()

      expect(availability.cachedModels).toEqual([
        'Qwen2.5-7B-Instruct-q4f16_1-MLC',
        'Llama-3.2-3B-Instruct-q4f16_1-MLC'
      ])
      expect(availability.cachedTTSModels).toEqual([
        'zh_CN-xiaoxiao-medium',
        'en_GB-alan-medium'
      ])
    })

    it('应该处理缓存检查错误', async () => {
      mockModelCacheManager.getCachedModelIds.mockRejectedValue(new Error('Cache error'))

      const availability = await aiErrorHandler.checkOfflineAvailability()

      expect(availability.available).toBe(false)
      expect(availability.cachedModels).toEqual([])
      expect(availability.cachedTTSModels).toEqual([])
      expect(availability.totalCacheSize).toBe(0)
    })
  })

  describe('属性3: 离线模式启用', () => {
    it('应该正确启用离线模式（有缓存模型）', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue([
        'Qwen2.5-3B-Instruct-q4f16_1-MLC',
        'tts-zh_CN-huayan-medium'
      ])

      await aiErrorHandler.enableOfflineMode()

      expect(aiErrorHandler.isInFallback()).toBe(true)
      expect(aiErrorHandler.fallbackReason.value).toBe('离线模式')
      expect(aiErrorHandler.currentError.value?.userMessage).toContain('已缓存的2个模型')
    })

    it('应该正确启用离线模式（无缓存模型）', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue([])

      await aiErrorHandler.enableOfflineMode()

      expect(aiErrorHandler.isInFallback()).toBe(true)
      expect(aiErrorHandler.fallbackReason.value).toBe('离线模式')
      expect(aiErrorHandler.currentError.value?.userMessage).toContain('没有已缓存的模型')
      expect(aiErrorHandler.currentError.value?.fallbackAvailable).toBe(false)
    })

    it('应该处理离线模式启用错误', async () => {
      mockModelCacheManager.getCachedModelIds.mockRejectedValue(new Error('Storage error'))

      await aiErrorHandler.enableOfflineMode()

      expect(aiErrorHandler.isInFallback()).toBe(true)
      expect(aiErrorHandler.currentError.value?.userMessage).toContain('无法启用离线模式')
    })

    it('应该广播离线模式启用事件', async () => {
      const { syncChannel } = await import('@/utils/broadcast')
      mockModelCacheManager.getCachedModelIds.mockResolvedValue(['test-model'])

      await aiErrorHandler.enableOfflineMode()

      expect(syncChannel.publish).toHaveBeenCalledWith('ai-offline-mode-enabled', {
        timestamp: expect.any(Number)
      })
    })
  })

  describe('属性4: 离线功能限制', () => {
    it('应该提供完整的离线限制说明', () => {
      const limitations = aiErrorHandler.getOfflineLimitations()

      expect(limitations).toBeInstanceOf(Array)
      expect(limitations.length).toBeGreaterThan(0)
      
      // 检查关键限制是否包含
      const limitationText = limitations.join(' ')
      expect(limitationText).toMatch(/缓存.*模型/)
      expect(limitationText).toMatch(/无法下载/)
      expect(limitationText).toMatch(/在线功能/)
      expect(limitationText).toMatch(/TTS/)
    })

    it('每个限制说明应该是中文且易于理解', () => {
      const limitations = aiErrorHandler.getOfflineLimitations()

      limitations.forEach(limitation => {
        // 检查是中文
        expect(limitation).toMatch(/[\u4e00-\u9fa5]/)
        
        // 检查长度合理
        expect(limitation.length).toBeGreaterThan(5)
        expect(limitation.length).toBeLessThan(100)
        
        // 检查不包含技术术语
        expect(limitation).not.toMatch(/API|HTTP|WebGPU|IndexedDB/)
      })
    })

    it('限制说明应该涵盖主要功能领域', () => {
      const limitations = aiErrorHandler.getOfflineLimitations()
      const allText = limitations.join(' ')

      // 检查是否涵盖主要功能
      expect(allText).toMatch(/模型/)  // AI模型相关
      expect(allText).toMatch(/下载/)  // 下载功能
      expect(allText).toMatch(/在线/)  // 在线功能
      expect(allText).toMatch(/TTS/)   // TTS功能
      expect(allText).toMatch(/性能/)  // 性能监控
    })
  })

  describe('属性5: 网络状态变化处理', () => {
    it('应该处理从在线到离线的状态变化', async () => {
      // 初始在线状态
      mockNavigator.onLine = true
      let status = await aiErrorHandler.detectNetworkStatus()
      expect(status.online).toBe(true)

      // 切换到离线状态
      mockNavigator.onLine = false
      status = await aiErrorHandler.detectNetworkStatus()
      expect(status.online).toBe(false)
    })

    it('应该处理从离线到在线的状态变化', async () => {
      // 初始离线状态
      mockNavigator.onLine = false
      let status = await aiErrorHandler.detectNetworkStatus()
      expect(status.online).toBe(false)

      // 切换到在线状态
      mockNavigator.onLine = true
      status = await aiErrorHandler.detectNetworkStatus()
      expect(status.online).toBe(true)
    })

    it('应该处理网络连接质量变化', async () => {
      mockNavigator.onLine = true
      
      // 高质量网络
      mockNavigator.connection.effectiveType = '4g'
      mockNavigator.connection.downlink = 20
      mockNavigator.connection.rtt = 50
      
      let status = await aiErrorHandler.detectNetworkStatus()
      expect(status.effectiveType).toBe('4g')
      expect(status.downlink).toBe(20)
      expect(status.rtt).toBe(50)

      // 低质量网络
      mockNavigator.connection.effectiveType = '2g'
      mockNavigator.connection.downlink = 0.5
      mockNavigator.connection.rtt = 500
      
      status = await aiErrorHandler.detectNetworkStatus()
      expect(status.effectiveType).toBe('2g')
      expect(status.downlink).toBe(0.5)
      expect(status.rtt).toBe(500)
    })
  })

  describe('属性6: 离线模式下的错误处理', () => {
    it('离线模式下的错误应该提供适当的用户提示', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue(['test-model'])
      await aiErrorHandler.enableOfflineMode()

      expect(aiErrorHandler.currentError.value?.userMessage).toContain('离线模式')
      expect(aiErrorHandler.currentError.value?.retryable).toBe(true)
    })

    it('无缓存模型时应该提供明确的限制说明', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue([])
      await aiErrorHandler.enableOfflineMode()

      expect(aiErrorHandler.currentError.value?.userMessage).toContain('没有已缓存的模型')
      expect(aiErrorHandler.currentError.value?.userMessage).toContain('网络恢复后重试')
    })

    it('缓存访问错误应该提供存储权限提示', async () => {
      mockModelCacheManager.getCachedModelIds.mockRejectedValue(new Error('Storage access denied'))
      await aiErrorHandler.enableOfflineMode()

      expect(aiErrorHandler.currentError.value?.userMessage).toContain('浏览器存储权限')
    })
  })

  describe('属性7: 离线功能的性能考虑', () => {
    it('缓存检查应该在合理时间内完成', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue(['test-model'])
      mockModelCacheManager.getCacheStats.mockResolvedValue({
        totalSize: 1000000,
        modelCount: 1,
        oldestAccess: Date.now(),
        newestAccess: Date.now()
      })

      const startTime = Date.now()
      await aiErrorHandler.checkOfflineAvailability()
      const endTime = Date.now()

      // 缓存检查应该在100ms内完成
      expect(endTime - startTime).toBeLessThan(100)
    })

    it('网络状态检测应该有合理的超时', async () => {
      mockNavigator.onLine = true
      // 模拟慢速网络请求
      ;(global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ ok: true }), 1000))
      )

      const startTime = Date.now()
      await aiErrorHandler.detectNetworkStatus()
      const endTime = Date.now()

      // 网络检测应该在合理时间内完成（考虑3秒超时）
      expect(endTime - startTime).toBeLessThan(4000)
    })
  })

  describe('属性8: 边界条件处理', () => {
    it('应该处理navigator对象不存在的情况', async () => {
      const originalNavigator = global.navigator
      delete (global as any).navigator

      try {
        const status = await aiErrorHandler.detectNetworkStatus()
        expect(status.online).toBe(false) // 没有navigator时应该返回false
      } finally {
        global.navigator = originalNavigator
      }
    })

    it('应该处理connection API不支持的情况', async () => {
      const originalConnection = mockNavigator.connection
      delete mockNavigator.connection

      try {
        const status = await aiErrorHandler.detectNetworkStatus()
        expect(status.online).toBeDefined()
        expect(status.effectiveType).toBeUndefined()
      } finally {
        mockNavigator.connection = originalConnection
      }
    })

    it('应该处理fetch API不可用的情况', async () => {
      const originalFetch = global.fetch
      delete (global as any).fetch

      try {
        const status = await aiErrorHandler.detectNetworkStatus()
        expect(status.online).toBe(mockNavigator.onLine)
      } finally {
        global.fetch = originalFetch
      }
    })
  })

  describe('属性9: 离线模式状态一致性', () => {
    it('离线模式状态应该在组件间保持一致', async () => {
      expect(aiErrorHandler.isInFallback()).toBe(false)

      mockModelCacheManager.getCachedModelIds.mockResolvedValue(['test-model'])
      await aiErrorHandler.enableOfflineMode()

      expect(aiErrorHandler.isInFallback()).toBe(true)
      expect(aiErrorHandler.fallbackReason.value).toBe('离线模式')
    })

    it('退出离线模式应该清理所有相关状态', () => {
      // 先进入离线模式
      aiErrorHandler.isInFallbackMode.value = true
      aiErrorHandler.fallbackReason.value = '离线模式'

      // 退出离线模式
      aiErrorHandler.exitFallbackMode()

      expect(aiErrorHandler.isInFallback()).toBe(false)
      expect(aiErrorHandler.fallbackReason.value).toBe('')
      expect(aiErrorHandler.currentError.value).toBeNull()
    })
  })

  describe('属性10: 用户体验优化', () => {
    it('离线模式提示应该包含可用功能说明', async () => {
      mockModelCacheManager.getCachedModelIds.mockResolvedValue([
        'Qwen2.5-3B-Instruct-q4f16_1-MLC',
        'tts-zh_CN-huayan-medium'
      ])

      await aiErrorHandler.enableOfflineMode()

      const userMessage = aiErrorHandler.currentError.value?.userMessage
      expect(userMessage).toContain('可以使用')
      expect(userMessage).toContain('模型')
      expect(userMessage).toMatch(/\d+/)  // 应该包含数字（模型数量）
    })

    it('离线限制说明应该提供建设性建议', () => {
      const limitations = aiErrorHandler.getOfflineLimitations()
      
      // 检查是否包含建设性的表述而不是纯粹的限制
      const hasPositiveGuidance = limitations.some(limitation => 
        limitation.includes('可以') || limitation.includes('仅限于') || limitation.includes('已缓存')
      )
      
      expect(hasPositiveGuidance).toBe(true)
    })
  })
})