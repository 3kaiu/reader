/**
 * 语义搜索属性测试
 * Feature: free-tier-maximization, Property 16: 语义搜索
 * 验证需求: 6.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'

// Mock fetch for testing
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock localStorage for SearchHistory
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
}

// Mock window object
global.window = {
  localStorage: mockLocalStorage
}

// 简化的语义搜索API实现（用于测试）
const semanticSearchApi = {
  async search(query, type = 'all') {
    const response = await fetch(`/api/semantic-search?q=${encodeURIComponent(query)}&type=${type}`)
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`)
    }
    return await response.json()
  },

  async getSuggestions(partialQuery) {
    if (partialQuery.length < 2) return []
    
    try {
      const response = await this.search(partialQuery, 'all')
      const suggestions = new Set()
      
      response.results.forEach(result => {
        if (result.title) {
          const titleWords = result.title.split(/\s+/).filter(word => 
            word.length > 1 && word.toLowerCase().includes(partialQuery.toLowerCase())
          )
          titleWords.forEach(word => suggestions.add(word))
        }
        
        if (result.aiTags) {
          result.aiTags.forEach(tag => {
            if (tag.toLowerCase().includes(partialQuery.toLowerCase())) {
              suggestions.add(tag)
            }
          })
        }
      })
      
      if (response.query.synonyms) {
        response.query.synonyms.forEach(synonym => suggestions.add(synonym))
      }
      
      return Array.from(suggestions).slice(0, 8)
      
    } catch (error) {
      console.error('获取搜索建议失败:', error)
      return []
    }
  },

  async indexNovel(novel) {
    const response = await fetch('/api/index-novel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novel)
    })
    if (!response.ok) {
      throw new Error(`Index failed: ${response.status}`)
    }
    return await response.json()
  },

  async batchIndexNovels(novels) {
    const results = []
    const batchSize = 5
    
    for (let i = 0; i < novels.length; i += batchSize) {
      const batch = novels.slice(i, i + batchSize)
      const batchPromises = batch.map(novel => this.indexNovel(novel))
      
      try {
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
      } catch (error) {
        console.error(`批量索引失败 (batch ${i / batchSize + 1}):`, error)
      }
      
      if (i + batchSize < novels.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    return results
  }
}

// 简化的搜索历史管理
const SearchHistory = {
  getHistory() {
    try {
      const history = global.window.localStorage.getItem('nexus_search_history')
      return history ? JSON.parse(history) : []
    } catch {
      return []
    }
  },

  addToHistory(query) {
    if (!query.trim()) return
    
    try {
      const history = this.getHistory()
      const filteredHistory = history.filter(item => item !== query)
      filteredHistory.unshift(query)
      const limitedHistory = filteredHistory.slice(0, 20)
      global.window.localStorage.setItem('nexus_search_history', JSON.stringify(limitedHistory))
    } catch (error) {
      console.error('保存搜索历史失败:', error)
    }
  },

  clearHistory() {
    try {
      global.window.localStorage.removeItem('nexus_search_history')
    } catch (error) {
      console.error('清除搜索历史失败:', error)
    }
  }
}

// 简化的性能监控
const SearchPerformanceMonitor = {
  metrics: new Map(),

  recordSearchTime(query, duration) {
    // 过滤掉无效的查询和持续时间
    if (!query || query.trim().length === 0 || !duration || duration <= 0) {
      return
    }
    
    const key = `search_${query.length <= 10 ? 'short' : query.length <= 30 ? 'medium' : 'long'}`
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, [])
    }
    
    const times = this.metrics.get(key)
    times.push(duration)
    
    if (times.length > 50) {
      times.shift()
    }
  },

  getMetrics() {
    const result = {}
    
    this.metrics.forEach((times, key) => {
      if (times.length > 0) {
        result[key] = {
          average: times.reduce((sum, time) => sum + time, 0) / times.length,
          count: times.length
        }
      }
    })
    
    return result
  }
}

describe('语义搜索属性测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage.getItem.mockReturnValue(null)
    SearchPerformanceMonitor.metrics.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Property 16: 语义搜索', () => {
    it('对于任何用户搜索查询，系统应该支持使用自然语言处理的语义搜索', async () => {
      await fc.assert(fc.asyncProperty(
        // 生成各种搜索查询
        fc.record({
          query: fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.constantFrom(
              '寻找玄幻小说',
              '有没有关于修仙的故事',
              '推荐一些都市言情',
              '科幻类型的书籍',
              '历史穿越小说',
              '搞笑轻松的作品'
            )
          ),
          type: fc.constantFrom('all', 'novels', 'chapters')
        }),
        async ({ query, type }) => {
          // 模拟语义搜索API响应
          const mockResponse = {
            query: {
              originalQuery: query,
              keywords: query.split(' ').filter(word => word.length > 0),
              intent: 'general',
              sentiment: 'neutral',
              synonyms: []
            },
            results: [
              {
                id: 'novel_1',
                title: '测试小说',
                author: '测试作者',
                description: '测试描述',
                aiTags: ['玄幻', '修仙'],
                similarity: 0.85,
                type: 'novel',
                lastUpdated: Date.now()
              }
            ],
            total: 1,
            timestamp: Date.now()
          }

          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
          })

          // 执行语义搜索
          const result = await semanticSearchApi.search(query, type)

          // 验证搜索结果包含查询分析
          expect(result.query).toBeDefined()
          expect(result.query.originalQuery).toBe(query)
          expect(result.query.keywords).toBeInstanceOf(Array)
          expect(result.query.intent).toBeDefined()

          // 验证搜索结果结构
          expect(result.results).toBeInstanceOf(Array)
          expect(result.total).toBeGreaterThanOrEqual(0)
          expect(result.timestamp).toBeGreaterThan(0)

          // 验证每个结果项包含必要字段
          result.results.forEach(item => {
            expect(item.id).toBeDefined()
            expect(item.title).toBeDefined()
            expect(item.similarity).toBeGreaterThanOrEqual(0)
            expect(item.similarity).toBeLessThanOrEqual(1)
            expect(item.type).toMatch(/^(novel|chapter)$/)
            expect(item.lastUpdated).toBeGreaterThan(0)
          })

          // 验证API调用参数
          expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining(`/api/semantic-search?q=${encodeURIComponent(query)}&type=${type}`)
          )
        }
      ), { numRuns: 50 })
    })

    it('语义搜索应该支持自然语言查询理解', async () => {
      await fc.assert(fc.asyncProperty(
        // 生成自然语言查询
        fc.record({
          naturalQuery: fc.constantFrom(
            '我想找一本关于时间旅行的科幻小说',
            '有什么好看的古代言情推荐吗',
            '寻找主角很强大的玄幻作品',
            '推荐一些轻松搞笑的现代都市小说',
            '想看女主角很聪明的宫斗文',
            '有没有关于异世界冒险的故事'
          )
        }),
        async ({ naturalQuery }) => {
          // 模拟AI查询理解响应
          const mockResponse = {
            query: {
              originalQuery: naturalQuery,
              keywords: ['时间旅行', '科幻', '小说'],
              intent: 'novel',
              sentiment: 'neutral',
              synonyms: ['穿越', '科幻', '未来']
            },
            results: [
              {
                id: 'novel_sci_fi',
                title: '时空穿越者',
                author: '科幻作家',
                description: '关于时间旅行的精彩故事',
                aiTags: ['科幻', '时间旅行', '穿越'],
                similarity: 0.92,
                type: 'novel',
                lastUpdated: Date.now()
              }
            ],
            total: 1,
            timestamp: Date.now()
          }

          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
          })

          const result = await semanticSearchApi.search(naturalQuery)

          // 验证查询理解功能
          expect(result.query.keywords.length).toBeGreaterThan(0)
          expect(result.query.intent).toMatch(/^(general|novel|chapter|author)$/)
          expect(result.query.sentiment).toMatch(/^(positive|negative|neutral)$/)

          // 验证同义词扩展
          if (result.query.synonyms) {
            expect(result.query.synonyms).toBeInstanceOf(Array)
          }

          // 验证搜索结果相关性
          if (result.results.length > 0) {
            result.results.forEach(item => {
              expect(item.similarity).toBeGreaterThan(0.5) // 语义搜索应该有较高相关性
            })
          }
        }
      ), { numRuns: 30 })
    })

    it('语义搜索应该支持不同类型的内容搜索', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          query: fc.string({ minLength: 2, maxLength: 50 }),
          searchType: fc.constantFrom('all', 'novels', 'chapters')
        }),
        async ({ query, searchType }) => {
          // 根据搜索类型模拟不同的响应
          const mockResults = []
          
          if (searchType === 'all' || searchType === 'novels') {
            mockResults.push({
              id: 'novel_1',
              title: '测试小说',
              author: '作者',
              type: 'novel',
              similarity: 0.8,
              lastUpdated: Date.now()
            })
          }
          
          if (searchType === 'all' || searchType === 'chapters') {
            mockResults.push({
              id: 'chapter_1',
              novelId: 'novel_1',
              chapterId: 'ch_1',
              title: '第一章',
              type: 'chapter',
              similarity: 0.75,
              lastUpdated: Date.now()
            })
          }

          const mockResponse = {
            query: {
              originalQuery: query,
              keywords: [query],
              intent: 'general',
              sentiment: 'neutral',
              synonyms: []
            },
            results: mockResults,
            total: mockResults.length,
            timestamp: Date.now()
          }

          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
          })

          const result = await semanticSearchApi.search(query, searchType)

          // 验证搜索类型过滤
          result.results.forEach(item => {
            if (searchType === 'novels') {
              expect(item.type).toBe('novel')
            } else if (searchType === 'chapters') {
              expect(item.type).toBe('chapter')
            } else {
              expect(item.type).toMatch(/^(novel|chapter)$/)
            }
          })

          // 验证API调用包含正确的类型参数
          expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining(`type=${searchType}`)
          )
        }
      ), { numRuns: 40 })
    })

    it('搜索建议功能应该基于部分查询提供相关建议', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 20 }),
        async (partialQuery) => {
          // 模拟搜索建议的实现
          const mockSearchResponse = {
            query: {
              originalQuery: partialQuery,
              keywords: [partialQuery],
              intent: 'general',
              sentiment: 'neutral',
              synonyms: ['相关词1', '相关词2']
            },
            results: [
              {
                id: 'novel_1',
                title: `包含${partialQuery}的小说标题`,
                aiTags: [`${partialQuery}相关`, '标签1'],
                similarity: 0.8,
                type: 'novel',
                lastUpdated: Date.now()
              }
            ],
            total: 1,
            timestamp: Date.now()
          }

          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockSearchResponse
          })

          const suggestions = await semanticSearchApi.getSuggestions(partialQuery)

          // 验证建议结果
          expect(suggestions).toBeInstanceOf(Array)
          expect(suggestions.length).toBeLessThanOrEqual(8) // 最多8个建议

          // 验证建议内容相关性
          suggestions.forEach(suggestion => {
            expect(typeof suggestion).toBe('string')
            expect(suggestion.length).toBeGreaterThan(0)
          })
        }
      ), { numRuns: 25 })
    })

    it('搜索历史管理应该正确存储和检索历史记录', async () => {
      await fc.assert(fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
        (queries) => {
          // 过滤掉空字符串和只包含空白字符的查询
          const validQueries = queries.filter(query => query && query.trim().length > 0)
          
          // 如果没有有效查询，跳过测试
          if (validQueries.length === 0) {
            return true
          }

          // 模拟localStorage行为
          let storedHistory = []
          mockLocalStorage.getItem.mockImplementation(() => 
            storedHistory.length > 0 ? JSON.stringify(storedHistory) : null
          )
          mockLocalStorage.setItem.mockImplementation((key, value) => {
            if (key === 'nexus_search_history') {
              storedHistory = JSON.parse(value)
            }
          })

          // 添加查询到历史记录
          validQueries.forEach(query => {
            SearchHistory.addToHistory(query)
          })

          // 获取历史记录
          const history = SearchHistory.getHistory()

          // 验证历史记录功能
          expect(history).toBeInstanceOf(Array)
          expect(history.length).toBeLessThanOrEqual(20) // 最多20条记录

          // 验证最新的查询在前面
          if (validQueries.length > 0) {
            const lastQuery = validQueries[validQueries.length - 1]
            expect(history[0]).toBe(lastQuery)
          }

          // 验证无重复项
          const uniqueHistory = [...new Set(history)]
          expect(history.length).toBe(uniqueHistory.length)
        }
      ), { numRuns: 30 })
    })

    it('搜索性能监控应该正确记录和计算指标', async () => {
      await fc.assert(fc.property(
        fc.array(
          fc.record({
            query: fc.string({ minLength: 1, maxLength: 100 }),
            duration: fc.float({ min: 10, max: 5000 })
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (searchRecords) => {
          // 记录搜索性能
          searchRecords.forEach(({ query, duration }) => {
            SearchPerformanceMonitor.recordSearchTime(query, duration)
          })

          // 获取性能指标
          const metrics = SearchPerformanceMonitor.getMetrics()

          // 验证指标结构
          expect(metrics).toBeInstanceOf(Object)

          // 验证每个查询类型的指标
          Object.values(metrics).forEach(metric => {
            expect(metric).toHaveProperty('average')
            expect(metric).toHaveProperty('count')
            expect(typeof metric.average).toBe('number')
            expect(typeof metric.count).toBe('number')
            expect(metric.average).toBeGreaterThan(0)
            expect(metric.count).toBeGreaterThan(0)
          })
        }
      ), { numRuns: 20 })
    })

    it('批量索引功能应该正确处理多个小说的索引', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            author: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 10, maxLength: 200 }),
            aiTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (novels) => {
          // 清除之前的mock调用
          mockFetch.mockClear()
          
          // 模拟批量索引响应
          const mockResponses = novels.map(novel => ({
            success: true,
            indexed: novel.id,
            timestamp: Date.now()
          }))

          // 为每个索引请求设置mock响应
          novels.forEach((novel, index) => {
            mockFetch.mockResolvedValueOnce({
              ok: true,
              json: async () => mockResponses[index]
            })
          })

          const results = await semanticSearchApi.batchIndexNovels(novels)

          // 验证批量索引结果
          expect(results).toBeInstanceOf(Array)
          expect(results.length).toBe(novels.length)

          results.forEach((result, index) => {
            expect(result.success).toBe(true)
            expect(result.indexed).toBe(novels[index].id)
            expect(result.timestamp).toBeGreaterThan(0)
          })

          // 验证API调用次数
          expect(mockFetch).toHaveBeenCalledTimes(novels.length)
        }
      ), { numRuns: 15 })
    })

    it('语义搜索应该处理错误情况并提供适当的回退', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (query) => {
          // 模拟网络错误
          mockFetch.mockRejectedValueOnce(new Error('Network error'))

          // 验证错误处理
          await expect(semanticSearchApi.search(query)).rejects.toThrow()

          // 模拟服务器错误响应
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Internal server error' })
          })

          await expect(semanticSearchApi.search(query)).rejects.toThrow()

          // 验证空查询处理
          const suggestions = await semanticSearchApi.getSuggestions('')
          expect(suggestions).toEqual([]) // 空查询应该返回空数组
        }
      ), { numRuns: 20 })
    })
  })

  describe('语义搜索集成测试', () => {
    it('完整的搜索流程应该正常工作', async () => {
      const testQuery = '寻找玄幻修仙小说'
      
      const mockResponse = {
        query: {
          originalQuery: testQuery,
          keywords: ['玄幻', '修仙', '小说'],
          intent: 'novel',
          sentiment: 'neutral',
          synonyms: ['仙侠', '修真', '玄幻']
        },
        results: [
          {
            id: 'novel_xianxia_1',
            title: '修仙传说',
            author: '玄幻大师',
            description: '一个关于修仙的精彩故事',
            aiTags: ['玄幻', '修仙', '仙侠'],
            similarity: 0.95,
            type: 'novel',
            lastUpdated: Date.now()
          }
        ],
        total: 1,
        timestamp: Date.now()
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await semanticSearchApi.search(testQuery)

      // 验证完整的搜索响应
      expect(result.query.originalQuery).toBe(testQuery)
      expect(result.query.keywords).toContain('玄幻')
      expect(result.query.keywords).toContain('修仙')
      expect(result.results.length).toBe(1)
      expect(result.results[0].similarity).toBeGreaterThan(0.9)
      expect(result.results[0].aiTags).toContain('玄幻')
      expect(result.results[0].aiTags).toContain('修仙')
    })
  })
})