/**
 * 内容自动分类组件
 * 提供AI驱动的内容分析和批量分类功能
 */
import React, { useState, useEffect, useCallback } from 'react'
import { 
  contentClassificationApi, 
  ClassificationAnalyzer,
  ClassificationCache,
  type ClassificationResult,
  type BatchStatus,
  type ClassificationStats,
  type NovelForClassification 
} from '@/api/contentClassification'

interface ContentClassificationProps {
  novels?: NovelForClassification[]
  onClassificationComplete?: (results: ClassificationResult[]) => void
  onError?: (error: string) => void
  className?: string
}

export const ContentClassification: React.FC<ContentClassificationProps> = ({
  novels = [],
  onClassificationComplete,
  onError,
  className = ''
}) => {
  // 状态管理
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [results, setResults] = useState<ClassificationResult[]>([])
  const [stats, setStats] = useState<ClassificationStats | null>(null)
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  // 加载统计信息
  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const statsData = await contentClassificationApi.getClassificationStats()
      setStats(statsData)
    } catch (error) {
      console.error('加载统计信息失败:', error)
    }
  }

  // 开始批量分类
  const startBatchClassification = useCallback(async () => {
    if (novels.length === 0) {
      onError?.('没有可分类的小说')
      return
    }

    if (stats && stats.remainingRequests < novels.length) {
      onError?.(`剩余AI请求不足，今日还可处理 ${stats.remainingRequests} 个小说`)
      return
    }

    setIsProcessing(true)
    setProgress({ processed: 0, total: novels.length })
    setResults([])
    setErrors([])

    try {
      const classificationResults = await contentClassificationApi.smartBatchClassify(
        novels,
        {
          onProgress: (progressData) => {
            setProgress(progressData)
            
            // 缓存新的分类结果
            if (progressData.current) {
              ClassificationCache.set(progressData.current.novelId, progressData.current)
            }
          },
          onError: (error) => {
            const errorMsg = `批次 ${error.batchIndex} 失败: ${error.error}`
            setErrors(prev => [...prev, errorMsg])
            onError?.(errorMsg)
          }
        }
      )

      setResults(classificationResults)
      onClassificationComplete?.(classificationResults)
      
      // 重新加载统计信息
      await loadStats()

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '分类处理失败'
      setErrors(prev => [...prev, errorMsg])
      onError?.(errorMsg)
    } finally {
      setIsProcessing(false)
    }
  }, [novels, stats, onClassificationComplete, onError])

  // 单个小说分类
  const classifySingleNovel = useCallback(async (novel: NovelForClassification) => {
    try {
      // 检查缓存
      const cached = ClassificationCache.get(novel.id)
      if (cached) {
        return cached
      }

      const result = await contentClassificationApi.classifyNovel(novel)
      
      // 缓存结果
      ClassificationCache.set(novel.id, result)
      
      return result
    } catch (error) {
      console.error(`分类小说 ${novel.id} 失败:`, error)
      throw error
    }
  }, [])

  // 渲染分类结果
  const renderClassificationResult = (result: ClassificationResult) => (
    <div key={result.novelId} className="classification-result">
      <div className="result-header">
        <span className="novel-id">{result.novelId}</span>
        <span className="confidence">置信度: {Math.round(result.confidence * 100)}%</span>
        {result.fromCache && <span className="cache-indicator">缓存</span>}
      </div>
      
      <div className="classification-details">
        {result.genre.categories.length > 0 && (
          <div className="category-group">
            <strong>类型:</strong> {result.genre.categories.join(', ')}
            <span className="confidence-score">({Math.round(result.genre.confidence * 100)}%)</span>
          </div>
        )}
        
        {result.theme.categories.length > 0 && (
          <div className="category-group">
            <strong>主题:</strong> {result.theme.categories.join(', ')}
            <span className="confidence-score">({Math.round(result.theme.confidence * 100)}%)</span>
          </div>
        )}
        
        {result.target.categories.length > 0 && (
          <div className="category-group">
            <strong>目标读者:</strong> {result.target.categories.join(', ')}
            <span className="confidence-score">({Math.round(result.target.confidence * 100)}%)</span>
          </div>
        )}
        
        {result.quality.categories.length > 0 && (
          <div className="category-group">
            <strong>质量评估:</strong> {result.quality.categories.join(', ')}
            <span className="confidence-score">({Math.round(result.quality.confidence * 100)}%)</span>
          </div>
        )}
        
        {result.aiTags.length > 0 && (
          <div className="ai-tags">
            <strong>AI标签:</strong>
            <div className="tags-container">
              {result.aiTags.map(tag => (
                <span key={tag} className="ai-tag">{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // 渲染统计信息
  const renderStats = () => {
    if (!stats) return null

    return (
      <div className="classification-stats">
        <h3>分类统计</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">今日已用请求:</span>
            <span className="stat-value">{stats.todayRequests}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">剩余请求:</span>
            <span className="stat-value">{stats.remainingRequests}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">每日限制:</span>
            <span className="stat-value">{stats.dailyRequestLimit}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">批处理大小:</span>
            <span className="stat-value">{stats.batchConfig.batchSize}</span>
          </div>
        </div>
        
        <div className="usage-bar">
          <div 
            className="usage-fill"
            style={{ 
              width: `${(stats.todayRequests / stats.dailyRequestLimit) * 100}%` 
            }}
          />
        </div>
      </div>
    )
  }

  // 渲染分析报告
  const renderAnalysisReport = () => {
    if (results.length === 0) return null

    const report = ClassificationAnalyzer.generateReport(results)

    return (
      <div className="analysis-report">
        <h3>分类分析报告</h3>
        
        <div className="report-summary">
          <div className="summary-item">
            <span className="summary-label">处理总数:</span>
            <span className="summary-value">{report.summary.totalProcessed}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">平均置信度:</span>
            <span className="summary-value">{Math.round(report.summary.averageConfidence * 100)}%</span>
          </div>
        </div>

        {report.confidence.lowConfidenceItems.length > 0 && (
          <div className="low-confidence-warning">
            <strong>⚠️ 低置信度项目:</strong> {report.confidence.lowConfidenceItems.length} 个
          </div>
        )}

        {report.recommendations.length > 0 && (
          <div className="recommendations">
            <strong>建议:</strong>
            <ul>
              {report.recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="distribution-summary">
          <h4>分类分布</h4>
          <div className="distribution-grid">
            <div className="distribution-item">
              <strong>热门类型:</strong>
              {Object.entries(report.distribution.genreDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([genre, count]) => (
                  <span key={genre} className="distribution-tag">
                    {genre} ({count})
                  </span>
                ))}
            </div>
            
            <div className="distribution-item">
              <strong>主要主题:</strong>
              {Object.entries(report.distribution.themeDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([theme, count]) => (
                  <span key={theme} className="distribution-tag">
                    {theme} ({count})
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`content-classification ${className}`}>
      <div className="classification-header">
        <h2>内容自动分类</h2>
        {renderStats()}
      </div>

      <div className="classification-controls">
        <button
          onClick={startBatchClassification}
          disabled={isProcessing || novels.length === 0}
          className="classify-button"
        >
          {isProcessing ? '分类中...' : `开始分类 (${novels.length} 个小说)`}
        </button>

        <button
          onClick={() => ClassificationCache.clear()}
          className="clear-cache-button"
        >
          清除缓存
        </button>

        <button
          onClick={loadStats}
          className="refresh-stats-button"
        >
          刷新统计
        </button>
      </div>

      {isProcessing && (
        <div className="progress-section">
          <div className="progress-info">
            <span>进度: {progress.processed} / {progress.total}</span>
            <span>{Math.round((progress.processed / progress.total) * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${(progress.processed / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="errors-section">
          <h3>处理错误</h3>
          {errors.map((error, index) => (
            <div key={index} className="error-item">{error}</div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="results-section">
          <h3>分类结果 ({results.length})</h3>
          
          {renderAnalysisReport()}
          
          <div className="results-list">
            {results.map(renderClassificationResult)}
          </div>
        </div>
      )}
    </div>
  )
}

export default ContentClassification