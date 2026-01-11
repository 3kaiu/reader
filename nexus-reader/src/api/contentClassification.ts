/**
 * 内容自动分类 API
 * 使用 Cloudflare Workers AI 进行智能内容分析和分类
 */
import { $get, $post } from './client'

// 分类结果接口
export interface ClassificationResult {
  novelId: string
  genre: CategoryResult
  theme: CategoryResult
  target: CategoryResult
  quality: CategoryResult
  confidence: number
  aiTags: string[]
  timestamp: number
  fromCache?: boolean
}

// 分类类别结果
export interface CategoryResult {
  categories: string[]
  confidence: number
}

// 批处理结果
export interface BatchClassificationResult {
  batchId: string
  success: ClassificationResult[]
  errors: BatchError[]
  total: number
  processed: number
  failed: number
}

// 批处理错误
export interface BatchError {
  batchIndex: number
  error: string
  novels: string[]
}

// 批处理状态
export interface BatchStatus {
  status: 'processing' | 'completed' | 'failed'
  total: number
  processed: number
  startTime: number
  endTime?: number
  success?: ClassificationResult[]
  errors?: BatchError[]
  failed?: number
}

// 分类统计
export interface ClassificationStats {
  dailyRequestLimit: number
  todayRequests: number
  remainingRequests: number
  categories: {
    genre: string[]
    theme: string[]
    target: string[]
    status: string[]
    quality: string[]
  }
  batchConfig: {
    batchSize: number
    maxConcurrent: number
  }
}

// 小说数据结构（用于分类）
export interface NovelForClassification {
  id: string
  title: string
  author?: string
  description?: string
  chapters?: Array<{
    id: string
    title: string
    content: string
  }>
  tags?: string[]
}

export const contentClassificationApi = {
  /**
   * 对单个小说进行自动分类
   * @param novel 小说数据
   */
  classifyNovel: (novel: NovelForClassification) =>
    $post<ClassificationResult>('/api/classify-novel', novel),

  /**
   * 批量分类小说
   * @param novels 小说数组
   * @param batchId 可选的批处理ID
   */
  batchClassify: (novels: NovelForClassification[], batchId?: string) =>
    $post<BatchClassificationResult>('/api/batch-classify', { novels, batchId }),

  /**
   * 查询批处理状态
   * @param batchId 批处理ID
   */
  getBatchStatus: (batchId: string) =>
    $get<BatchStatus>(`/api/batch-status?batchId=${encodeURIComponent(batchId)}`),

  /**
   * 获取分类统计信息
   */
  getClassificationStats: () =>
    $get<ClassificationStats>('/api/classification-stats'),

  /**
   * 智能批量处理 - 自动管理批次大小和并发
   * @param novels 小说数组
   * @param options 处理选项
   */
  smartBatchClassify: async (
    novels: NovelForClassification[], 
    options: {
      onProgress?: (progress: { processed: number; total: number; current?: ClassificationResult }) => void
      onError?: (error: BatchError) => void
      maxRetries?: number
    } = {}
  ): Promise<ClassificationResult[]> => {
    const { onProgress, onError, maxRetries = 3 } = options
    const results: ClassificationResult[] = []
    const batchSize = 20 // 适中的批次大小
    
    for (let i = 0; i < novels.length; i += batchSize) {
      const batch = novels.slice(i, i + batchSize)
      let retries = 0
      
      while (retries < maxRetries) {
        try {
          const batchResult = await contentClassificationApi.batchClassify(batch)
          
          // 收集成功结果
          results.push(...batchResult.success)
          
          // 报告错误
          if (batchResult.errors.length > 0 && onError) {
            batchResult.errors.forEach(onError)
          }
          
          // 报告进度
          if (onProgress) {
            onProgress({
              processed: results.length,
              total: novels.length
            })
          }
          
          break // 成功，跳出重试循环
          
        } catch (error) {
          retries++
          console.error(`批次 ${Math.floor(i / batchSize) + 1} 失败 (重试 ${retries}/${maxRetries}):`, error)
          
          if (retries >= maxRetries) {
            // 最大重试次数后，报告错误
            if (onError) {
              onError({
                batchIndex: Math.floor(i / batchSize) + 1,
                error: error instanceof Error ? error.message : '未知错误',
                novels: batch.map(n => n.id)
              })
            }
          } else {
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, 1000 * retries))
          }
        }
      }
      
      // 批次间延迟，避免速率限制
      if (i + batchSize < novels.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    return results
  }
}

// 分类结果分析工具
export class ClassificationAnalyzer {
  /**
   * 分析分类结果的置信度分布
   */
  static analyzeConfidence(results: ClassificationResult[]): {
    average: number
    distribution: { range: string; count: number }[]
    lowConfidenceItems: ClassificationResult[]
  } {
    if (results.length === 0) {
      return {
        average: 0,
        distribution: [],
        lowConfidenceItems: []
      }
    }

    const confidences = results.map(r => r.confidence)
    const average = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length

    // 置信度分布
    const ranges = [
      { min: 0, max: 0.3, label: '低 (0-30%)' },
      { min: 0.3, max: 0.6, label: '中 (30-60%)' },
      { min: 0.6, max: 0.8, label: '高 (60-80%)' },
      { min: 0.8, max: 1, label: '很高 (80-100%)' }
    ]

    const distribution = ranges.map(range => ({
      range: range.label,
      count: confidences.filter(conf => conf >= range.min && conf < range.max).length
    }))

    // 低置信度项目 (< 0.5)
    const lowConfidenceItems = results.filter(r => r.confidence < 0.5)

    return {
      average,
      distribution,
      lowConfidenceItems
    }
  }

  /**
   * 分析分类标签的分布
   */
  static analyzeTagDistribution(results: ClassificationResult[]): {
    genreDistribution: Record<string, number>
    themeDistribution: Record<string, number>
    targetDistribution: Record<string, number>
    qualityDistribution: Record<string, number>
    mostCommonTags: Array<{ tag: string; count: number }>
  } {
    const genreCount: Record<string, number> = {}
    const themeCount: Record<string, number> = {}
    const targetCount: Record<string, number> = {}
    const qualityCount: Record<string, number> = {}
    const tagCount: Record<string, number> = {}

    results.forEach(result => {
      // 统计类型分布
      result.genre.categories.forEach(genre => {
        genreCount[genre] = (genreCount[genre] || 0) + 1
      })

      // 统计主题分布
      result.theme.categories.forEach(theme => {
        themeCount[theme] = (themeCount[theme] || 0) + 1
      })

      // 统计目标读者分布
      result.target.categories.forEach(target => {
        targetCount[target] = (targetCount[target] || 0) + 1
      })

      // 统计质量分布
      result.quality.categories.forEach(quality => {
        qualityCount[quality] = (qualityCount[quality] || 0) + 1
      })

      // 统计所有AI标签
      result.aiTags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1
      })
    })

    // 最常见的标签
    const mostCommonTags = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    return {
      genreDistribution: genreCount,
      themeDistribution: themeCount,
      targetDistribution: targetCount,
      qualityDistribution: qualityCount,
      mostCommonTags
    }
  }

  /**
   * 生成分类报告
   */
  static generateReport(results: ClassificationResult[]): {
    summary: {
      totalProcessed: number
      averageConfidence: number
      processingTime?: number
    }
    confidence: ReturnType<typeof ClassificationAnalyzer.analyzeConfidence>
    distribution: ReturnType<typeof ClassificationAnalyzer.analyzeTagDistribution>
    recommendations: string[]
  } {
    const confidence = this.analyzeConfidence(results)
    const distribution = this.analyzeTagDistribution(results)

    // 生成建议
    const recommendations: string[] = []
    
    if (confidence.average < 0.6) {
      recommendations.push('整体分类置信度较低，建议检查输入数据质量或调整分类模型')
    }
    
    if (confidence.lowConfidenceItems.length > results.length * 0.2) {
      recommendations.push('超过20%的项目置信度较低，建议人工审核这些分类结果')
    }
    
    const topGenre = Object.entries(distribution.genreDistribution)
      .sort(([,a], [,b]) => b - a)[0]
    if (topGenre && topGenre[1] > results.length * 0.5) {
      recommendations.push(`${topGenre[0]}类型占比过高(${Math.round(topGenre[1]/results.length*100)}%)，可能存在分类偏向`)
    }

    return {
      summary: {
        totalProcessed: results.length,
        averageConfidence: confidence.average
      },
      confidence,
      distribution,
      recommendations
    }
  }
}

// 分类缓存管理
export class ClassificationCache {
  private static readonly CACHE_KEY = 'nexus_classification_cache'
  private static readonly MAX_CACHE_SIZE = 1000
  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24小时

  /**
   * 获取缓存的分类结果
   */
  static get(novelId: string): ClassificationResult | null {
    try {
      const cache = localStorage.getItem(this.CACHE_KEY)
      if (!cache) return null

      const cacheData = JSON.parse(cache)
      const item = cacheData[novelId]
      
      if (!item) return null
      
      // 检查是否过期
      if (Date.now() - item.timestamp > this.CACHE_TTL) {
        this.remove(novelId)
        return null
      }
      
      return item.result
    } catch {
      return null
    }
  }

  /**
   * 缓存分类结果
   */
  static set(novelId: string, result: ClassificationResult): void {
    try {
      const cache = localStorage.getItem(this.CACHE_KEY)
      const cacheData = cache ? JSON.parse(cache) : {}
      
      // 添加新项
      cacheData[novelId] = {
        result,
        timestamp: Date.now()
      }
      
      // 限制缓存大小
      const keys = Object.keys(cacheData)
      if (keys.length > this.MAX_CACHE_SIZE) {
        // 删除最旧的项
        const sortedKeys = keys.sort((a, b) => 
          cacheData[a].timestamp - cacheData[b].timestamp
        )
        const keysToDelete = sortedKeys.slice(0, keys.length - this.MAX_CACHE_SIZE)
        keysToDelete.forEach(key => delete cacheData[key])
      }
      
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData))
    } catch (error) {
      console.error('缓存分类结果失败:', error)
    }
  }

  /**
   * 移除缓存项
   */
  static remove(novelId: string): void {
    try {
      const cache = localStorage.getItem(this.CACHE_KEY)
      if (!cache) return

      const cacheData = JSON.parse(cache)
      delete cacheData[novelId]
      
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData))
    } catch (error) {
      console.error('移除缓存失败:', error)
    }
  }

  /**
   * 清空缓存
   */
  static clear(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.error('清空缓存失败:', error)
    }
  }

  /**
   * 获取缓存统计
   */
  static getStats(): { size: number; oldestTimestamp: number; newestTimestamp: number } {
    try {
      const cache = localStorage.getItem(this.CACHE_KEY)
      if (!cache) return { size: 0, oldestTimestamp: 0, newestTimestamp: 0 }

      const cacheData = JSON.parse(cache)
      const timestamps = Object.values(cacheData).map((item: any) => item.timestamp)
      
      return {
        size: Object.keys(cacheData).length,
        oldestTimestamp: Math.min(...timestamps),
        newestTimestamp: Math.max(...timestamps)
      }
    } catch {
      return { size: 0, oldestTimestamp: 0, newestTimestamp: 0 }
    }
  }
}