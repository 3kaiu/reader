/**
 * 语义搜索 API
 * 使用 Cloudflare Workers AI 进行自然语言搜索
 */
import { $get, $post } from './client'

// 查询分析结果
export interface QueryAnalysis {
  originalQuery: string
  keywords: string[]
  intent: 'general' | 'novel' | 'chapter' | 'author'
  sentiment: 'positive' | 'negative' | 'neutral'
  synonyms: string[]
}

// 搜索结果项
export interface SemanticSearchResult {
  id: string
  title: string
  author?: string
  description?: string
  aiTags?: string[]
  similarity: number
  type: 'novel' | 'chapter'
  novelId?: string  // 章节搜索时的小说ID
  chapterId?: string  // 章节ID
  summary?: string  // 章节摘要
  lastUpdated: number
}

// 语义搜索响应
export interface SemanticSearchResponse {
  query: QueryAnalysis
  results: SemanticSearchResult[]
  total: number
  timestamp: number
}

// 索引响应
export interface IndexResponse {
  success: boolean
  indexed: string
  timestamp: number
}

// 小说数据结构（用于索引）
export interface NovelForIndex {
  id: string
  title: string
  author: string
  description: string
  aiTags?: string[]
}

// 章节数据结构（用于索引）
export interface ChapterForIndex {
  id: string
  title: string
  content: string
}

export const semanticSearchApi = {
  /**
   * 执行语义搜索
   * @param query 搜索查询
   * @param type 搜索类型：'all' | 'novels' | 'chapters'
   */
  search: (query: string, type: 'all' | 'novels' | 'chapters' = 'all') =>
    $get<SemanticSearchResponse>(`/api/semantic-search?q=${encodeURIComponent(query)}&type=${type}`),

  /**
   * 索引小说内容
   * @param novel 小说数据
   */
  indexNovel: (novel: NovelForIndex) =>
    $post<IndexResponse>('/api/index-novel', novel),

  /**
   * 索引章节内容
   * @param novelId 小说ID
   * @param chapter 章节数据
   */
  indexChapter: (novelId: string, chapter: ChapterForIndex) =>
    $post<IndexResponse>('/api/index-chapter', { novelId, chapter }),

  /**
   * 批量索引小说
   * @param novels 小说数组
   */
  batchIndexNovels: async (novels: NovelForIndex[]): Promise<IndexResponse[]> => {
    const results: IndexResponse[] = []
    
    // 批量处理，避免超出Worker限制
    const batchSize = 5
    for (let i = 0; i < novels.length; i += batchSize) {
      const batch = novels.slice(i, i + batchSize)
      const batchPromises = batch.map(novel => semanticSearchApi.indexNovel(novel))
      
      try {
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
      } catch (error) {
        console.error(`批量索引失败 (batch ${i / batchSize + 1}):`, error)
        // 继续处理下一批
      }
      
      // 添加延迟避免速率限制
      if (i + batchSize < novels.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    return results
  },

  /**
   * 智能搜索建议
   * @param partialQuery 部分查询
   */
  getSuggestions: async (partialQuery: string): Promise<string[]> => {
    if (partialQuery.length < 2) return []
    
    try {
      // 使用现有搜索结果生成建议
      const response = await semanticSearchApi.search(partialQuery, 'all')
      
      // 提取相关关键词作为建议
      const suggestions = new Set<string>()
      
      response.results.forEach(result => {
        // 添加标题中的关键词
        if (result.title) {
          const titleWords = result.title.split(/\s+/).filter(word => 
            word.length > 1 && word.toLowerCase().includes(partialQuery.toLowerCase())
          )
          titleWords.forEach(word => suggestions.add(word))
        }
        
        // 添加AI标签
        if (result.aiTags) {
          result.aiTags.forEach(tag => {
            if (tag.toLowerCase().includes(partialQuery.toLowerCase())) {
              suggestions.add(tag)
            }
          })
        }
      })
      
      // 添加查询分析中的同义词
      if (response.query.synonyms) {
        response.query.synonyms.forEach(synonym => suggestions.add(synonym))
      }
      
      return Array.from(suggestions).slice(0, 8) // 最多返回8个建议
      
    } catch (error) {
      console.error('获取搜索建议失败:', error)
      return []
    }
  }
}

// 搜索历史管理
export class SearchHistory {
  private static readonly STORAGE_KEY = 'nexus_search_history'
  private static readonly MAX_HISTORY = 20

  static getHistory(): string[] {
    try {
      const history = localStorage.getItem(this.STORAGE_KEY)
      return history ? JSON.parse(history) : []
    } catch {
      return []
    }
  }

  static addToHistory(query: string): void {
    if (!query.trim()) return
    
    try {
      const history = this.getHistory()
      
      // 移除重复项
      const filteredHistory = history.filter(item => item !== query)
      
      // 添加到开头
      filteredHistory.unshift(query)
      
      // 限制历史记录数量
      const limitedHistory = filteredHistory.slice(0, this.MAX_HISTORY)
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(limitedHistory))
    } catch (error) {
      console.error('保存搜索历史失败:', error)
    }
  }

  static clearHistory(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      console.error('清除搜索历史失败:', error)
    }
  }
}

// 搜索性能监控
export class SearchPerformanceMonitor {
  private static metrics: Map<string, number[]> = new Map()

  static recordSearchTime(query: string, duration: number): void {
    const key = `search_${query.length <= 10 ? 'short' : query.length <= 30 ? 'medium' : 'long'}`
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, [])
    }
    
    const times = this.metrics.get(key)!
    times.push(duration)
    
    // 只保留最近50次记录
    if (times.length > 50) {
      times.shift()
    }
  }

  static getAverageSearchTime(queryType: 'short' | 'medium' | 'long'): number {
    const key = `search_${queryType}`
    const times = this.metrics.get(key) || []
    
    if (times.length === 0) return 0
    
    return times.reduce((sum, time) => sum + time, 0) / times.length
  }

  static getMetrics() {
    const result: Record<string, { average: number; count: number }> = {}
    
    this.metrics.forEach((times, key) => {
      result[key] = {
        average: times.reduce((sum, time) => sum + time, 0) / times.length,
        count: times.length
      }
    })
    
    return result
  }
}