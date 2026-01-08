/**
 * 📊 阅读分析模块
 * 提供深度阅读行为分析和优化建议
 * 
 * 功能:
 * - 阅读速度追踪
 * - 章节参与度分析
 * - 困惑段落检测
 * - 阅读习惯统计
 * - 个性化阅读建议
 */

import { ref, computed, watch } from 'vue'
import { openDB, type IDBPDatabase } from 'idb'

// 数据库配置
const DB_NAME = 'nexus-analytics'
const DB_VERSION = 1
const STORE_NAME = 'reading-sessions'

// 阅读会话接口
export interface ReadingSession {
  id: string
  bookId: string
  chapterIndex: number
  startTime: number
  endTime?: number
  // 阅读位置记录 (每10秒采样)
  positions: Array<{
    timestamp: number
    position: number // 百分比 0-100
    scrollVelocity: number // 滚动速度
  }>
  // 互动事件
  interactions: Array<{
    type: 'highlight' | 'bookmark' | 'ai_query' | 'pause' | 'reread'
    timestamp: number
    position: number
    data?: string
  }>
  // 计算指标
  metrics?: SessionMetrics
}

export interface SessionMetrics {
  totalDuration: number // 总阅读时长(秒)
  activeReadingTime: number // 活跃阅读时间(秒)
  averageSpeed: number // 平均速度(字/分钟)
  pauseCount: number // 暂停次数
  rereadSegments: number[] // 重读的段落
  engagementScore: number // 参与度 0-100
}

export interface ReadingInsight {
  type: 'speed' | 'engagement' | 'pattern' | 'recommendation'
  title: string
  description: string
  data?: Record<string, unknown>
}

let dbInstance: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('bookId', 'bookId')
        store.createIndex('startTime', 'startTime')
      }
    }
  })

  return dbInstance
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 计算阅读指标
 */
export function calculateMetrics(session: ReadingSession): SessionMetrics {
  const positions = session.positions
  if (positions.length < 2) {
    return {
      totalDuration: 0,
      activeReadingTime: 0,
      averageSpeed: 0,
      pauseCount: 0,
      rereadSegments: [],
      engagementScore: 0,
    }
  }

  const totalDuration = (session.endTime || Date.now()) - session.startTime

  // 计算活跃时间 (排除长时间停留)
  let activeTime = 0
  let pauseCount = 0
  const rereadSegments: number[] = []

  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i].timestamp - positions[i - 1].timestamp
    if (gap < 30000) { // 30秒内算活跃
      activeTime += gap
    } else {
      pauseCount++
    }

    // 检测回读
    if (positions[i].position < positions[i - 1].position - 5) {
      rereadSegments.push(Math.floor(positions[i].position))
    }
  }

  // 计算平均速度 (假设每页约1000字)
  const progressMade = positions[positions.length - 1].position - positions[0].position
  const wordsRead = (progressMade / 100) * 3000 // 假设章节3000字
  const minutesSpent = activeTime / 60000
  const averageSpeed = minutesSpent > 0 ? wordsRead / minutesSpent : 0

  // 参与度评分
  let engagementScore = 50
  // 速度适中加分
  if (averageSpeed >= 200 && averageSpeed <= 400) engagementScore += 20
  // 少暂停加分
  if (pauseCount < 3) engagementScore += 15
  // 有互动加分
  engagementScore += Math.min(session.interactions.length * 5, 15)
  // 回读减分
  engagementScore -= rereadSegments.length * 3

  return {
    totalDuration: Math.round(totalDuration / 1000),
    activeReadingTime: Math.round(activeTime / 1000),
    averageSpeed: Math.round(averageSpeed),
    pauseCount,
    rereadSegments,
    engagementScore: Math.max(0, Math.min(100, engagementScore)),
  }
}

/**
 * 生成阅读洞察
 */
export function generateInsights(sessions: ReadingSession[]): ReadingInsight[] {
  const insights: ReadingInsight[] = []

  if (sessions.length === 0) return insights

  // 计算平均速度
  const speeds = sessions
    .filter(s => s.metrics && s.metrics.averageSpeed > 0)
    .map(s => s.metrics!.averageSpeed)

  if (speeds.length > 0) {
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length

    if (avgSpeed < 150) {
      insights.push({
        type: 'speed',
        title: '阅读速度偏慢',
        description: `平均 ${Math.round(avgSpeed)} 字/分钟。可以尝试减少回读，或使用 TTS 辅助。`,
        data: { average: avgSpeed }
      })
    } else if (avgSpeed > 500) {
      insights.push({
        type: 'speed',
        title: '阅读速度较快',
        description: `平均 ${Math.round(avgSpeed)} 字/分钟。确保没有遗漏重要情节。`,
        data: { average: avgSpeed }
      })
    }
  }

  // 参与度分析
  const engagements = sessions
    .filter(s => s.metrics)
    .map(s => s.metrics!.engagementScore)

  if (engagements.length >= 3) {
    const avgEngagement = engagements.reduce((a, b) => a + b, 0) / engagements.length

    if (avgEngagement < 40) {
      insights.push({
        type: 'engagement',
        title: '阅读专注度有提升空间',
        description: '建议找一个安静的环境，使用专注模式阅读。',
      })
    } else if (avgEngagement > 80) {
      insights.push({
        type: 'engagement',
        title: '阅读状态极佳',
        description: '保持这种节奏，你正在高效阅读！',
      })
    }
  }

  // 阅读时段分析
  const hourCounts = new Array(24).fill(0)
  sessions.forEach(s => {
    const hour = new Date(s.startTime).getHours()
    hourCounts[hour]++
  })

  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
  if (hourCounts[peakHour] >= 3) {
    insights.push({
      type: 'pattern',
      title: `你偏好在 ${peakHour}:00 阅读`,
      description: '这是你的黄金阅读时段，效率最高。',
      data: { peakHour, sessions: hourCounts[peakHour] }
    })
  }

  return insights
}

/**
 * 阅读分析组合式函数
 */
export function useReadingAnalytics() {
  const currentSession = ref<ReadingSession | null>(null)
  const isTracking = ref(false)
  const sessions = ref<ReadingSession[]>([])

  // 采样间隔 (10秒)
  const SAMPLE_INTERVAL = 10000
  let sampleTimer: ReturnType<typeof setInterval> | null = null

  const insights = computed(() => generateInsights(sessions.value))

  /**
   * 开始追踪阅读会话
   */
  function startSession(bookId: string, chapterIndex: number) {
    currentSession.value = {
      id: generateSessionId(),
      bookId,
      chapterIndex,
      startTime: Date.now(),
      positions: [],
      interactions: [],
    }
    isTracking.value = true

    // 开始定时采样
    sampleTimer = setInterval(() => {
      if (currentSession.value) {
        samplePosition()
      }
    }, SAMPLE_INTERVAL)
  }

  /**
   * 采样当前阅读位置
   */
  function samplePosition(position?: number) {
    if (!currentSession.value) return

    // 如果没有传入位置，尝试从页面获取
    const actualPosition = position ?? getScrollPosition()

    const lastPos = currentSession.value.positions.slice(-1)[0]
    const velocity = lastPos
      ? (actualPosition - lastPos.position) / ((Date.now() - lastPos.timestamp) / 1000)
      : 0

    currentSession.value.positions.push({
      timestamp: Date.now(),
      position: actualPosition,
      scrollVelocity: velocity,
    })
  }

  /**
   * 获取当前滚动位置 (百分比)
   */
  function getScrollPosition(): number {
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
    return scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0
  }

  /**
   * 记录互动事件
   */
  function recordInteraction(
    type: 'highlight' | 'bookmark' | 'ai_query' | 'pause' | 'reread',
    data?: string
  ) {
    if (!currentSession.value) return

    currentSession.value.interactions.push({
      type,
      timestamp: Date.now(),
      position: getScrollPosition(),
      data,
    })
  }

  /**
   * 结束并保存会话
   */
  async function endSession() {
    if (!currentSession.value) return

    // 停止采样
    if (sampleTimer) {
      clearInterval(sampleTimer)
      sampleTimer = null
    }

    currentSession.value.endTime = Date.now()
    currentSession.value.metrics = calculateMetrics(currentSession.value)

    // 保存到 IndexedDB
    try {
      const db = await getDB()
      await db.put(STORE_NAME, currentSession.value)
      sessions.value.push(currentSession.value)
    } catch (e) {
      console.error('[ReadingAnalytics] endSession error:', e)
    }

    currentSession.value = null
    isTracking.value = false
  }

  /**
   * 加载历史会话
   */
  async function loadSessions(bookId?: string, limit = 50): Promise<void> {
    try {
      const db = await getDB()
      let all: ReadingSession[]

      if (bookId) {
        all = await db.getAllFromIndex(STORE_NAME, 'bookId', bookId)
      } else {
        all = await db.getAll(STORE_NAME)
      }

      sessions.value = all
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, limit)
    } catch (e) {
      console.error('[ReadingAnalytics] loadSessions error:', e)
      sessions.value = []
    }
  }

  /**
   * 获取阅读统计摘要
   */
  function getSummary() {
    const validSessions = sessions.value.filter(s => s.metrics)

    if (validSessions.length === 0) {
      return {
        totalSessions: 0,
        totalTime: 0,
        averageSpeed: 0,
        averageEngagement: 0,
      }
    }

    return {
      totalSessions: validSessions.length,
      totalTime: validSessions.reduce((sum, s) => sum + (s.metrics?.totalDuration || 0), 0),
      averageSpeed: Math.round(
        validSessions.reduce((sum, s) => sum + (s.metrics?.averageSpeed || 0), 0) / validSessions.length
      ),
      averageEngagement: Math.round(
        validSessions.reduce((sum, s) => sum + (s.metrics?.engagementScore || 0), 0) / validSessions.length
      ),
    }
  }

  return {
    // 状态
    currentSession,
    isTracking,
    sessions,
    insights,

    // 方法
    startSession,
    samplePosition,
    recordInteraction,
    endSession,
    loadSessions,
    getSummary,

    // 工具
    calculateMetrics,
    generateInsights,
  }
}
