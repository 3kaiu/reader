/**
 * AI洞察状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { errorHandler, logger } from '@/utils/unified-utils'

interface InsightData {
  id: string
  type: 'reading_pattern' | 'content_analysis' | 'performance' | 'recommendation'
  title: string
  description: string
  data: any
  confidence: number
  timestamp: number
  actionable: boolean
}

interface AIInsightsState {
  insights: InsightData[]
  isAnalyzing: boolean
  lastAnalysis: number
  analysisProgress: number
}

export const useAIInsightsStore = defineStore('aiInsights', () => {
  const state = ref<AIInsightsState>({
    insights: [],
    isAnalyzing: false,
    lastAnalysis: 0,
    analysisProgress: 0
  })

  const insightsCount = computed(() => state.value.insights.length)
  const actionableInsights = computed(() =>
    state.value.insights.filter(insight => insight.actionable)
  )
  const recentInsights = computed(() =>
    state.value.insights
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
  )

  const analyzeReadingPatterns = async () => {
    try {
      state.value.isAnalyzing = true
      state.value.analysisProgress = 0

      logger.info('Starting reading pattern analysis...')

      // 这里应该调用AI服务进行分析
      // const response = await api.post('/ai/analyze/reading-patterns')

      // 模拟分析过程
      state.value.analysisProgress = 25

      // 生成洞察
      const insights: InsightData[] = [
        {
          id: 'reading_pattern_1',
          type: 'reading_pattern',
          title: '阅读高峰时段',
          description: '您最常在晚上8-10点阅读，建议在这个时间段推荐新内容',
          data: { peakHours: [20, 21, 22], confidence: 0.85 },
          confidence: 0.85,
          timestamp: Date.now(),
          actionable: true
        },
        {
          id: 'reading_pattern_2',
          type: 'reading_pattern',
          title: '阅读速度趋势',
          description: '您的阅读速度在稳步提升，平均每月提高5%',
          data: { trend: 'increasing', rate: 0.05 },
          confidence: 0.78,
          timestamp: Date.now(),
          actionable: false
        }
      ]

      state.value.analysisProgress = 100
      state.value.lastAnalysis = Date.now()
      state.value.insights.push(...insights)

      logger.info('Reading pattern analysis completed', { insightsCount: insights.length })

    } catch (error: any) {
      errorHandler.handle(error, { component: 'ai-insights-store', operation: 'analyzeReadingPatterns' })
    } finally {
      state.value.isAnalyzing = false
      state.value.analysisProgress = 0
    }
  }

  const analyzeContentPreferences = async () => {
    try {
      state.value.isAnalyzing = true
      state.value.analysisProgress = 0

      logger.info('Starting content preference analysis...')

      // 模拟分析过程
      state.value.analysisProgress = 50

      const insights: InsightData[] = [
        {
          id: 'content_pref_1',
          type: 'content_analysis',
          title: '偏好题材分析',
          description: '您偏好科幻和悬疑类小说，建议增加此类推荐',
          data: { preferredGenres: ['sci-fi', 'mystery'], confidence: 0.92 },
          confidence: 0.92,
          timestamp: Date.now(),
          actionable: true
        }
      ]

      state.value.analysisProgress = 100
      state.value.insights.push(...insights)

      logger.info('Content preference analysis completed')

    } catch (error: any) {
      errorHandler.handle(error, { component: 'ai-insights-store', operation: 'analyzeContentPreferences' })
    } finally {
      state.value.isAnalyzing = false
      state.value.analysisProgress = 0
    }
  }

  const generateRecommendations = async () => {
    try {
      logger.info('Generating AI recommendations...')

      const recommendations: InsightData[] = [
        {
          id: 'recommendation_1',
          type: 'recommendation',
          title: '个性化阅读计划',
          description: '基于您的阅读习惯，建议每日阅读30分钟，重点关注科幻题材',
          data: {
            dailyGoal: 30,
            preferredGenres: ['sci-fi'],
            schedule: 'evening'
          },
          confidence: 0.88,
          timestamp: Date.now(),
          actionable: true
        }
      ]

      state.value.insights.push(...recommendations)

      logger.info('AI recommendations generated', { count: recommendations.length })

    } catch (error: any) {
      errorHandler.handle(error, { component: 'ai-insights-store', operation: 'generateRecommendations' })
    }
  }

  const clearInsight = (id: string) => {
    const index = state.value.insights.findIndex(insight => insight.id === id)
    if (index >= 0) {
      state.value.insights.splice(index, 1)
      logger.info('Insight cleared', { id })
    }
  }

  const clearAllInsights = () => {
    state.value.insights = []
    logger.info('All insights cleared')
  }

  const markActionTaken = (id: string) => {
    const insight = state.value.insights.find(i => i.id === id)
    if (insight) {
      insight.actionable = false
      logger.info('Insight marked as action taken', { id })
    }
  }

  return {
    // State
    state,

    // Getters
    insightsCount,
    actionableInsights,
    recentInsights,

    // Actions
    analyzeReadingPatterns,
    analyzeContentPreferences,
    generateRecommendations,
    clearInsight,
    clearAllInsights,
    markActionTaken
  }
})