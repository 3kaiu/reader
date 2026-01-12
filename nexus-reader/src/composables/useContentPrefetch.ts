/**
 * 📦 内容预取模块
 * 智能预加载下一章节和相关内容
 * 
 * 功能:
 * - 章节预加载 (预取下N章)
 * - 智能预取 (根据阅读速度调整)
 * - 离线缓存管理
 * - 预取优先级队列
 */

import { ref, computed } from 'vue'

// 预取状态
export type PrefetchStatus = 'pending' | 'loading' | 'cached' | 'failed'

// 预取项
export interface PrefetchItem {
  chapterIndex: number
  priority: number // 0-10, 越高越优先
  status: PrefetchStatus
  cachedAt?: number
  size?: number // 字节
}

// 预取配置
export interface PrefetchConfig {
  enabled: boolean
  maxConcurrent: number
  maxCacheSize: number // MB
  lookahead: number // 预取章节数
  smartMode: boolean // 根据速度动态调整
}

const DEFAULT_CONFIG: PrefetchConfig = {
  enabled: true,
  maxConcurrent: 2,
  maxCacheSize: 50, // 50MB
  lookahead: 3,
  smartMode: true,
}

/**
 * 内容预取组合式函数
 */
export function useContentPrefetch(
  fetchChapter: (index: number) => Promise<string>,
  config: Partial<PrefetchConfig> = {}
) {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  const queue = ref<PrefetchItem[]>([])
  const cache = ref<Map<number, string>>(new Map())
  const activeRequests = ref(0)
  const isEnabled = ref(cfg.enabled)

  const totalCacheSize = computed(() => {
    let size = 0
    cache.value.forEach(content => {
      size += content.length * 2 // 估算字节
    })
    return size
  })

  const cacheSizeMB = computed(() => (totalCacheSize.value / (1024 * 1024)).toFixed(2))

  const pendingItems = computed(() =>
    queue.value.filter(item => item.status === 'pending')
  )

  /**
   * 添加预取任务
   */
  function addToQueue(chapterIndex: number, priority: number = 5) {
    // 已在队列或缓存中跳过
    if (queue.value.some(item => item.chapterIndex === chapterIndex)) return
    if (cache.value.has(chapterIndex)) return

    queue.value.push({
      chapterIndex,
      priority,
      status: 'pending',
    })

    // 按优先级排序
    queue.value.sort((a, b) => b.priority - a.priority)

    processQueue()
  }

  /**
   * 处理预取队列
   */
  async function processQueue() {
    if (!isEnabled.value) return
    if (activeRequests.value >= cfg.maxConcurrent) return

    const next = queue.value.find(item => item.status === 'pending')
    if (!next) return

    // 检查缓存大小限制
    if (totalCacheSize.value > cfg.maxCacheSize * 1024 * 1024) {
      evictOldest()
    }

    next.status = 'loading'
    activeRequests.value++

    try {
      const content = await fetchChapter(next.chapterIndex)
      cache.value.set(next.chapterIndex, content)
      next.status = 'cached'
      next.cachedAt = Date.now()
      next.size = content.length * 2
    } catch (e) {
      next.status = 'failed'
      console.warn(`[Prefetch] Failed to prefetch chapter ${next.chapterIndex}:`, e)
    } finally {
      activeRequests.value--
      // 继续处理队列
      processQueue()
    }
  }

  /**
   * 从缓存获取章节
   */
  function getFromCache(chapterIndex: number): string | null {
    return cache.value.get(chapterIndex) ?? null
  }

  /**
   * 检查章节是否已缓存
   */
  function isCached(chapterIndex: number): boolean {
    return cache.value.has(chapterIndex)
  }

  /**
   * 驱逐最旧的缓存
   */
  function evictOldest() {
    const cached = queue.value
      .filter(item => item.status === 'cached' && item.cachedAt)
      .sort((a, b) => (a.cachedAt || 0) - (b.cachedAt || 0))

    if (cached.length > 0) {
      const oldest = cached[0]
      cache.value.delete(oldest.chapterIndex)
      queue.value = queue.value.filter(item => item.chapterIndex !== oldest.chapterIndex)
    }
  }

  /**
   * 预取当前位置周围的章节
   */
  function prefetchAround(currentIndex: number, totalChapters: number) {
    if (!isEnabled.value) return

    // 预取后续章节 (高优先级)
    for (let i = 1; i <= cfg.lookahead; i++) {
      const nextIndex = currentIndex + i
      if (nextIndex < totalChapters) {
        addToQueue(nextIndex, 10 - i) // 越近优先级越高
      }
    }

    // 预取前一章 (低优先级，用于回看)
    if (currentIndex > 0 && !cache.value.has(currentIndex - 1)) {
      addToQueue(currentIndex - 1, 2)
    }
  }

  /**
   * 智能预取 (根据阅读速度调整)
   */
  function smartPrefetch(
    currentIndex: number,
    totalChapters: number,
    readingSpeedWPM: number
  ) {
    if (!cfg.smartMode || !isEnabled.value) return

    // 快速阅读者预取更多章节
    let lookahead = cfg.lookahead
    if (readingSpeedWPM > 400) {
      lookahead = Math.min(lookahead + 2, 6)
    } else if (readingSpeedWPM < 150) {
      lookahead = Math.max(lookahead - 1, 1)
    }

    for (let i = 1; i <= lookahead; i++) {
      const nextIndex = currentIndex + i
      if (nextIndex < totalChapters) {
        addToQueue(nextIndex, 10 - i)
      }
    }
  }

  /**
   * 清除所有缓存
   */
  function clearCache() {
    cache.value.clear()
    queue.value = []
  }

  /**
   * 获取预取状态
   */
  function getStatus(chapterIndex: number): PrefetchStatus | null {
    const item = queue.value.find(i => i.chapterIndex === chapterIndex)
    if (item) return item.status
    if (cache.value.has(chapterIndex)) return 'cached'
    return null
  }

  /**
   * 暂停/恢复预取
   */
  function setEnabled(enabled: boolean) {
    isEnabled.value = enabled
    if (enabled) {
      processQueue()
    }
  }

  return {
    // 状态
    queue,
    cache,
    activeRequests,
    isEnabled,
    totalCacheSize,
    cacheSizeMB,
    pendingItems,

    // 方法
    addToQueue,
    getFromCache,
    isCached,
    prefetchAround,
    smartPrefetch,
    clearCache,
    getStatus,
    setEnabled,
  }
}

/**
 * 网络状态感知预取
 */
export function useNetworkAwarePrefetch() {
  const isOnline = ref(navigator.onLine)
  const connectionType = ref<string>('unknown')
  const isSlowConnection = ref(false)

  // 监听网络变化
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { isOnline.value = true })
    window.addEventListener('offline', () => { isOnline.value = false })

    // 检测网络类型
    const nav = navigator as Navigator & { connection?: { effectiveType: string } }
    if (nav.connection) {
      connectionType.value = nav.connection.effectiveType
      isSlowConnection.value = ['slow-2g', '2g'].includes(nav.connection.effectiveType)
    }
  }

  /**
   * 根据网络状态获取推荐配置
   */
  function getRecommendedConfig(): Partial<PrefetchConfig> {
    if (!isOnline.value) {
      return { enabled: false }
    }

    if (isSlowConnection.value) {
      return {
        enabled: true,
        maxConcurrent: 1,
        lookahead: 1,
        maxCacheSize: 20,
      }
    }

    return {
      enabled: true,
      maxConcurrent: 3,
      lookahead: 5,
      maxCacheSize: 100,
    }
  }

  return {
    isOnline,
    connectionType,
    isSlowConnection,
    getRecommendedConfig,
  }
}
