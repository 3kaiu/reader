/**
 * 内容分类 Hook
 * 管理AI驱动的内容分析和分类功能
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  contentClassificationApi, 
  ClassificationAnalyzer,
  ClassificationCache,
  type ClassificationResult,
  type ClassificationStats,
  type NovelForClassification,
  type BatchError
} from '@/api/contentClassification'

interface UseContentClassificationOptions {
  autoCache?: boolean
  maxRetries?: number
  batchSize?: number
  onProgress?: (progress: { processed: number; total: number }) => void
  onError?: (error: string) => void
}

interface ClassificationState {
  isProcessing: boolean
  results: ClassificationResult[]
  stats: ClassificationStats | null
  errors: string[]
  progress: { processed: number; total: number }
  currentBatchId: string | null
}

export function useContentClassification(options: UseContentClassificationOptions = {}) {
  const {
    autoCache = true,
    maxRetries = 3,
    batchSize = 20,
    onProgress,
    onError
  } = options

  // 状态管理
  const [state, setState] = useState<ClassificationState>({
    isProcessing: false,
    results: [],
    stats: null,
    errors: [],
    progress: { processed: 0, total: 0 },
    currentBatchId: null
  })

  // 处理队列和缓存
  const processingQueue = useRef<NovelForClassification[]>([])
  const abortController = useRef<AbortController | null>(null)

  // 初始化统计信息
  useEffect(() => {
    loadStats()
  }, [])

  // 清理资源
  useEffect(() => {
    return () => {
      if (abortController.current) {
        abortController.current.abort()
      }
    }
  }, [])

  // 加载统计信息
  const loadStats = useCallback(async () => {
    try {
      const stats = await contentClassificationApi.getClassificationStats()
      setState(prev => ({ ...prev, stats }))
      return stats
    } catch (error) {
      console.error('加载统计信息失败:', error)
      const errorMsg = '加载统计信息失败'
      setState(prev => ({ ...prev, errors: [...prev.errors, errorMsg] }))
      onError?.(errorMsg)
      return null
    }
  }, [onError])

  // 单个小说分类
  const classifyNovel = useCallback(async (novel: NovelForClassification): Promise<ClassificationResult | null> => {
    try {
      // 检查缓存
      if (autoCache) {
        const cached = ClassificationCache.get(novel.id)
        if (cached) {
          return cached
        }
      }

      const result = await contentClassificationApi.classifyNovel(novel)
      
      // 缓存结果
      if (autoCache) {
        ClassificationCache.set(novel.id, result)
      }

      return result
    } catch (error) {
      console.error(`分类小说 ${novel.id} 失败:`, error)
      const errorMsg = `分类小说 ${novel.title || novel.id} 失败: ${error instanceof Error ? error.message : '未知错误'}`
      setState(prev => ({ ...prev, errors: [...prev.errors, errorMsg] }))
      onError?.(errorMsg)
      return null
    }
  }, [autoCache, onError])

  // 批量分类
  const batchClassify = useCallback(async (novels: NovelForClassification[]) => {
    if (novels.length === 0) {
      onError?.('没有可分类的小说')
      return []
    }

    // 检查AI请求限制
    if (state.stats && state.stats.remainingRequests < novels.length) {
      const errorMsg = `剩余AI请求不足，今日还可处理 ${state.stats.remainingRequests} 个小说`
      onError?.(errorMsg)
      return []
    }

    setState(prev => ({
      ...prev,
      isProcessing: true,
      progress: { processed: 0, total: novels.length },
      results: [],
      errors: []
    }))

    // 创建中止控制器
    abortController.current = new AbortController()
    processingQueue.current = [...novels]

    try {
      const results = await contentClassificationApi.smartBatchClassify(
        novels,
        {
          onProgress: (progressData) => {
            setState(prev => ({ ...prev, progress: progressData }))
            onProgress?.(progressData)
            
            // 缓存新结果
            if (autoCache && progressData.current) {
              ClassificationCache.set(progressData.current.novelId, progressData.current)
            }
          },
          onError: (error: BatchError) => {
            const errorMsg = `批次 ${error.batchIndex} 失败: ${error.error}`
            setState(prev => ({ ...prev, errors: [...prev.errors, errorMsg] }))
            onError?.(errorMsg)
          },
          maxRetries
        }
      )

      setState(prev => ({
        ...prev,
        results: results,
        isProcessing: false
      }))

      // 重新加载统计信息
      await loadStats()

      return results

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '批量分类失败'
      setState(prev => ({
        ...prev,
        errors: [...prev.errors, errorMsg],
        isProcessing: false
      }))
      onError?.(errorMsg)
      return []
    } finally {
      abortController.current = null
      processingQueue.current = []
    }
  }, [state.stats, autoCache, maxRetries, onProgress, onError, loadStats])

  // 智能分类 - 自动处理缓存和批次优化
  const smartClassify = useCallback(async (novels: NovelForClassification[]) => {
    if (novels.length === 0) return []

    // 检查缓存，分离已缓存和未缓存的小说
    const uncachedNovels: NovelForClassification[] = []
    const cachedResults: ClassificationResult[] = []

    if (autoCache) {
      novels.forEach(novel => {
        const cached = ClassificationCache.get(novel.id)
        if (cached) {
          cachedResults.push(cached)
        } else {
          uncachedNovels.push(novel)
        }
      })
    } else {
      uncachedNovels.push(...novels)
    }

    // 如果所有结果都已缓存
    if (uncachedNovels.length === 0) {
      setState(prev => ({ ...prev, results: cachedResults }))
      return cachedResults
    }

    // 批量处理未缓存的小说
    const newResults = await batchClassify(uncachedNovels)
    const allResults = [...cachedResults, ...newResults]

    setState(prev => ({ ...prev, results: allResults }))
    return allResults
  }, [autoCache, batchClassify])

  // 停止处理
  const stopProcessing = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort()
    }
    setState(prev => ({ ...prev, isProcessing: false }))
  }, [])

  // 清除结果
  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      results: [],
      errors: [],
      progress: { processed: 0, total: 0 }
    }))
  }, [])

  // 清除错误
  const clearErrors = useCallback(() => {
    setState(prev => ({ ...prev, errors: [] }))
  }, [])

  // 清除缓存
  const clearCache = useCallback(() => {
    ClassificationCache.clear()
  }, [])

  // 获取分析报告
  const getAnalysisReport = useCallback(() => {
    if (state.results.length === 0) return null
    return ClassificationAnalyzer.generateReport(state.results)
  }, [state.results])

  // 获取缓存统计
  const getCacheStats = useCallback(() => {
    return ClassificationCache.getStats()
  }, [])

  // 导出结果
  const exportResults = useCallback((format: 'json' | 'csv' = 'json') => {
    if (state.results.length === 0) return null

    if (format === 'json') {
      return JSON.stringify(state.results, null, 2)
    }

    if (format === 'csv') {
      const headers = [
        'Novel ID', 'Genre', 'Theme', 'Target', 'Quality', 
        'Confidence', 'AI Tags', 'Timestamp'
      ]
      
      const rows = state.results.map(result => [
        result.novelId,
        result.genre.categories.join(';'),
        result.theme.categories.join(';'),
        result.target.categories.join(';'),
        result.quality.categories.join(';'),
        result.confidence.toFixed(3),
        result.aiTags.join(';'),
        new Date(result.timestamp).toISOString()
      ])

      return [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n')
    }

    return null
  }, [state.results])

  // 按条件过滤结果
  const filterResults = useCallback((filters: {
    minConfidence?: number
    genres?: string[]
    themes?: string[]
    targets?: string[]
    qualities?: string[]
  }) => {
    return state.results.filter(result => {
      if (filters.minConfidence && result.confidence < filters.minConfidence) {
        return false
      }
      
      if (filters.genres && !filters.genres.some(genre => 
        result.genre.categories.includes(genre)
      )) {
        return false
      }
      
      if (filters.themes && !filters.themes.some(theme => 
        result.theme.categories.includes(theme)
      )) {
        return false
      }
      
      if (filters.targets && !filters.targets.some(target => 
        result.target.categories.includes(target)
      )) {
        return false
      }
      
      if (filters.qualities && !filters.qualities.some(quality => 
        result.quality.categories.includes(quality)
      )) {
        return false
      }
      
      return true
    })
  }, [state.results])

  return {
    // 状态
    ...state,
    
    // 操作
    classifyNovel,
    batchClassify,
    smartClassify,
    stopProcessing,
    clearResults,
    clearErrors,
    clearCache,
    loadStats,
    
    // 分析和导出
    getAnalysisReport,
    getCacheStats,
    exportResults,
    filterResults,
    
    // 计算属性
    hasResults: state.results.length > 0,
    hasErrors: state.errors.length > 0,
    canProcess: state.stats ? state.stats.remainingRequests > 0 : false,
    processingProgress: state.progress.total > 0 ? 
      (state.progress.processed / state.progress.total) * 100 : 0
  }
}

export default useContentClassification