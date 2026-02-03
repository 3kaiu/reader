/**
 * 用户参与度跟踪组合函数
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useStatisticsStore } from '@/stores'

export function useEngagementTracker() {
  const statisticsStore = useStatisticsStore()

  const sessionStartTime = ref<number | null>(null)
  const lastActivityTime = ref<number>(Date.now())
  const pageViews = ref(0)
  const interactions = ref(0)
  const readingTime = ref(0)
  const sessionId = ref(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)

  let activityTimer: NodeJS.Timeout | null = null
  let readingTimer: NodeJS.Timeout | null = null

  const startTracking = () => {
    sessionStartTime.value = Date.now()
    pageViews.value++

    // 活动跟踪
    startActivityTracking()

    // 页面可见性跟踪
    trackPageVisibility()

    // 用户交互跟踪
    trackUserInteractions()

    // 发送会话开始事件
    trackEvent('session_start', {
      sessionId: sessionId.value,
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      url: window.location.href
    })
  }

  const stopTracking = () => {
    if (activityTimer) {
      clearInterval(activityTimer)
      activityTimer = null
    }

    if (readingTimer) {
      clearInterval(readingTimer)
      readingTimer = null
    }

    // 计算会话时长
    if (sessionStartTime.value) {
      const sessionDuration = Date.now() - sessionStartTime.value

      // 发送会话结束事件
      trackEvent('session_end', {
        sessionId: sessionId.value,
        duration: sessionDuration,
        pageViews: pageViews.value,
        interactions: interactions.value,
        readingTime: readingTime.value
      })
    }
  }

  const startActivityTracking = () => {
    activityTimer = setInterval(() => {
      const now = Date.now()
      const timeSinceLastActivity = now - lastActivityTime.value

      // 如果超过5分钟没有活动，认为用户离开
      if (timeSinceLastActivity > 5 * 60 * 1000) {
        trackEvent('user_idle', {
          idleTime: timeSinceLastActivity,
          sessionId: sessionId.value
        })
      }
    }, 60000) // 每分钟检查一次
  }

  const trackUserActivity = () => {
    lastActivityTime.value = Date.now()
    interactions.value++
  }

  const trackPageVisibility = () => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        trackEvent('page_hidden', {
          sessionId: sessionId.value,
          timeSpent: Date.now() - (sessionStartTime.value || Date.now())
        })
      } else {
        trackEvent('page_visible', {
          sessionId: sessionId.value
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 清理函数
    onUnmounted(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    })
  }

  const trackUserInteractions = () => {
    const events = ['click', 'scroll', 'keydown', 'touchstart']

    const handleInteraction = (event: Event) => {
      trackUserActivity()

      trackEvent('user_interaction', {
        sessionId: sessionId.value,
        eventType: event.type,
        element: (event.target as HTMLElement)?.tagName?.toLowerCase(),
        timestamp: Date.now()
      })
    }

    events.forEach(eventType => {
      document.addEventListener(eventType, handleInteraction, { passive: true })
    })

    // 清理函数
    onUnmounted(() => {
      events.forEach(eventType => {
        document.removeEventListener(eventType, handleInteraction)
      })
    })
  }

  const trackReadingActivity = () => {
    let readingStartTime = Date.now()

    readingTimer = setInterval(() => {
      // 检查用户是否在阅读（基于滚动或键盘活动）
      const now = Date.now()
      const timeSinceActivity = now - lastActivityTime.value

      if (timeSinceActivity < 30000) { // 30秒内有活动
        readingTime.value += 10000 // 10秒阅读时间
      }
    }, 10000) // 每10秒更新
  }

  const trackEvent = (eventName: string, data: any) => {
    const event = {
      eventName,
      data: {
        ...data,
        timestamp: Date.now(),
        userId: 'anonymous', // 可以从store获取
        sessionId: sessionId.value
      }
    }

    // 发送到统计系统
    statisticsStore.recordEvent(event)

    // 可以发送到外部分析服务
    // sendToAnalytics(event)
  }

  const getEngagementMetrics = () => {
    const sessionDuration = sessionStartTime.value ?
      Date.now() - sessionStartTime.value : 0

    return {
      sessionId: sessionId.value,
      sessionDuration,
      pageViews: pageViews.value,
      interactions: interactions.value,
      readingTime: readingTime.value,
      engagementRate: interactions.value / Math.max(sessionDuration / 1000, 1),
      averageSessionTime: sessionDuration / pageViews.value
    }
  }

  // 初始化
  onMounted(() => {
    startTracking()
    trackReadingActivity()
  })

  onUnmounted(() => {
    stopTracking()
  })

  return {
    sessionId: readonly(sessionId),
    pageViews: readonly(pageViews),
    interactions: readonly(interactions),
    readingTime: readonly(readingTime),
    trackEvent,
    getEngagementMetrics
  }
}