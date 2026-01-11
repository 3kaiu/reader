/**
 * 语义搜索 Hook
 * 管理语义搜索的状态和逻辑
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  semanticSearchApi, 
  SearchHistory, 
  SearchPerformanceMonitor,
  type SemanticSearchResult,
  type QueryAnalysis,
  type NovelForIndex,
  type ChapterForIndex
} from '@/api/semanticSearch'

interface UseSemanticSearchOptions {
  autoSearch?: boolean
  debounceMs?: number
  maxResults?: number
  cacheResults?: boolean
}

interface SearchState {
  query: string
  results: SemanticSearchResult[]
  queryAnalysis: QueryAnalysis | null
  isLoading: boolean
  error: string | null
  suggestions: string[]
  searchHistory: string[]
}

interface SearchMetrics {
  totalSearches: number
  averageResponseTime: number
  cacheHitRate: number
  errorRate: number
}

export function useSemanticSearch(options: UseSemanticSearchOptions = {}) {
  const {
    autoSearch = true,
    debounceMs = 300,
    maxResults = 20,
    cacheResults = true
  } = options

  // 状态管理
  const [state, setState] = useState<SearchState>({
    query: '',
    results: [],
    queryAnalysis: null,
    isLoading: false,
    error: null,
    suggestions: [],
    searchHistory: []
  })

  // 缓存和性能跟踪
  const searchCache = useRef<Map<string, { results: SemanticSearchResult[], analysis: QueryAnalysis, timestamp: number }>>(new Map())
  const debounceTimer = useRef<NodeJS.Timeout>()
  const searchMetrics = useRef<SearchMetrics>({
    totalSearches: 0,
    averageResponseTime: 0,
    cacheHitRate: 0,
    errorRate: 0
  })

  // 初始化搜索历史
  useEffect(() => {
    setState(prev => ({
      ...prev,
      searchHistory: SearchHistory.getHistory()
    }))
  }, [])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  // 执行搜索
  const performSearch = useCallback(async (
    query: string, 
    type: 'all' | 'novels' | 'chapters' = 'all',
    force = false
  ) => {
    if (!query.trim()) {
      setState(prev => ({
        ...prev,
        results: [],
        queryAnalysis: null,
        error: null
      }))
      return
    }

    const cacheKey = `${query.toLowerCase()}_${type}`
    
    // 检查缓存
    if (cacheResults && !force && searchCache.current.has(cacheKey)) {
      const cached = searchCache.current.get(cacheKey)!
      const isExpired = Date.now() - cached.timestamp > 5 * 60 * 1000 // 5分钟过期
      
      if (!isExpired) {
        setState(prev => ({
          ...prev,
          results: cached.results.slice(0, maxResults),
          queryAnalysis: cached.analysis,
          error: null
        }))
        
        // 更新缓存命中率
        searchMetrics.current.cacheHitRate = 
          (searchMetrics.current.cacheHitRate * searchMetrics.current.totalSearches + 1) / 
          (searchMetrics.current.totalSearches + 1)
        
        return
      }
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }))
    
    const startTime = performance.now()
    
    try {
      const response = await semanticSearchApi.search(query, type)
      const duration = performance.now() - startTime
      
      // 更新状态
      setState(prev => ({
        ...prev,
        results: response.results.slice(0, maxResults),
        queryAnalysis: response.query,
        isLoading: false,
        error: null
      }))

      // 缓存结果
      if (cacheResults) {
        searchCache.current.set(cacheKey, {
          results: response.results,
          analysis: response.query,
          timestamp: Date.now()
        })
        
        // 限制缓存大小
        if (searchCache.current.size > 100) {
          const firstKey = searchCache.current.keys().next().value
          searchCache.current.delete(firstKey)
        }
      }

      // 更新性能指标
      searchMetrics.current.totalSearches++
      searchMetrics.current.averageResponseTime = 
        (searchMetrics.current.averageResponseTime * (searchMetrics.current.totalSearches - 1) + duration) / 
        searchMetrics.current.totalSearches

      // 记录搜索历史
      SearchHistory.addToHistory(query)
      setState(prev => ({
        ...prev,
        searchHistory: SearchHistory.getHistory()
      }))

      // 记录性能监控
      SearchPerformanceMonitor.recordSearchTime(query, duration)

    } catch (error) {
      console.error('语义搜索失败:', error)
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : '搜索失败'
      }))

      // 更新错误率
      searchMetrics.current.totalSearches++
      searchMetrics.current.errorRate = 
        (searchMetrics.current.errorRate * (searchMetrics.current.totalSearches - 1) + 1) / 
        searchMetrics.current.totalSearches
    }
  }, [maxResults, cacheResults])

  // 防抖搜索
  const debouncedSearch = useCallback((
    query: string, 
    type: 'all' | 'novels' | 'chapters' = 'all'
  ) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    debounceTimer.current = setTimeout(() => {
      performSearch(query, type)
    }, debounceMs)
  }, [performSearch, debounceMs])

  // 设置查询
  const setQuery = useCallback((query: string, type: 'all' | 'novels' | 'chapters' = 'all') => {
    setState(prev => ({ ...prev, query }))
    
    if (autoSearch) {
      debouncedSearch(query, type)
    }
  }, [autoSearch, debouncedSearch])

  // 立即搜索
  const search = useCallback((query?: string, type: 'all' | 'novels' | 'chapters' = 'all') => {
    const searchQuery = query || state.query
    setState(prev => ({ ...prev, query: searchQuery }))
    performSearch(searchQuery, type, true)
  }, [state.query, performSearch])

  // 获取搜索建议
  const getSuggestions = useCallback(async (partialQuery: string) => {
    try {
      const suggestions = await semanticSearchApi.getSuggestions(partialQuery)
      setState(prev => ({ ...prev, suggestions }))
      return suggestions
    } catch (error) {
      console.error('获取搜索建议失败:', error)
      return []
    }
  }, [])

  // 清除搜索结果
  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      query: '',
      results: [],
      queryAnalysis: null,
      error: null,
      suggestions: []
    }))
  }, [])

  // 清除搜索历史
  const clearHistory = useCallback(() => {
    SearchHistory.clearHistory()
    setState(prev => ({ ...prev, searchHistory: [] }))
  }, [])

  // 清除缓存
  const clearCache = useCallback(() => {
    searchCache.current.clear()
  }, [])

  // 索引内容
  const indexNovel = useCallback(async (novel: NovelForIndex) => {
    try {
      const result = await semanticSearchApi.indexNovel(novel)
      return result
    } catch (error) {
      console.error('索引小说失败:', error)
      throw error
    }
  }, [])

  const indexChapter = useCallback(async (novelId: string, chapter: ChapterForIndex) => {
    try {
      const result = await semanticSearchApi.indexChapter(novelId, chapter)
      return result
    } catch (error) {
      console.error('索引章节失败:', error)
      throw error
    }
  }, [])

  const batchIndexNovels = useCallback(async (novels: NovelForIndex[]) => {
    try {
      const results = await semanticSearchApi.batchIndexNovels(novels)
      return results
    } catch (error) {
      console.error('批量索引失败:', error)
      throw error
    }
  }, [])

  // 获取性能指标
  const getMetrics = useCallback(() => {
    return {
      ...searchMetrics.current,
      cacheSize: searchCache.current.size,
      performanceMetrics: SearchPerformanceMonitor.getMetrics()
    }
  }, [])

  return {
    // 状态
    ...state,
    
    // 操作
    setQuery,
    search,
    getSuggestions,
    clearResults,
    clearHistory,
    clearCache,
    
    // 索引操作
    indexNovel,
    indexChapter,
    batchIndexNovels,
    
    // 性能监控
    getMetrics
  }
}

export default useSemanticSearch