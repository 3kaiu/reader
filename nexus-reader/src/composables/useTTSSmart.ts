/**
 * 🎭 TTS 智能增强模块
 * 为 TTS 朗读添加 AI 驱动的智能功能
 * 
 * 功能:
 * - 智能断句 (避免在句子中间断开)
 * - 情感检测 (根据内容调整语调)
 * - 对话识别 (不同角色使用不同语调)
 * - 朗读预处理 (清理特殊字符)
 */

import { ref, computed } from 'vue'

// 情感类型
export type SentimentType = 'neutral' | 'excited' | 'sad' | 'angry' | 'questioning' | 'whisper'

// 情感到语调映射
export const SENTIMENT_VOICE_MAP: Record<SentimentType, { pitch: number; rate: number }> = {
  neutral: { pitch: 1.0, rate: 1.0 },
  excited: { pitch: 1.15, rate: 1.1 },
  sad: { pitch: 0.85, rate: 0.9 },
  angry: { pitch: 1.2, rate: 1.15 },
  questioning: { pitch: 1.1, rate: 0.95 },
  whisper: { pitch: 0.9, rate: 0.85 },
}

/**
 * 智能断句 - 将文本按自然断点分割
 */
export function smartSegment(text: string): string[] {
  if (!text || text.length < 50) return [text]

  const segments: string[] = []

  // 主要断点: 。！？；
  // 次要断点: ，、：""
  const primaryBreaks = /([。！？；])/g
  const sentences = text.split(primaryBreaks).filter(s => s.trim())

  let current = ''
  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i]

    // 标点符号归入前一句
    if (/^[。！？；，、：]$/.test(part)) {
      current += part
      continue
    }

    current += part

    // 达到理想长度 (50-150字) 且以主要标点结尾则断句
    if (current.length >= 50 && /[。！？；]$/.test(current)) {
      segments.push(current.trim())
      current = ''
    }

    // 超长强制断句
    if (current.length > 200) {
      segments.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    segments.push(current.trim())
  }

  return segments.length > 0 ? segments : [text]
}

/**
 * 简单情感检测 (基于规则)
 * 用于快速判断句子情感，不依赖 AI
 */
export function detectSentiment(text: string): SentimentType {
  const trimmed = text.trim()

  // 感叹句
  if (trimmed.endsWith('！') || trimmed.endsWith('!')) {
    // 愤怒关键词
    if (/[混你妈该去滚蛋]|死/.test(trimmed)) {
      return 'angry'
    }
    // 兴奋关键词
    if (/[太厉害好棒哈]/.test(trimmed)) {
      return 'excited'
    }
    return 'excited'
  }

  // 疑问句
  if (trimmed.endsWith('？') || trimmed.endsWith('?')) {
    return 'questioning'
  }

  // 悲伤关键词
  if (/[哭泣泪眼悲伤难过痛苦唉]/.test(trimmed)) {
    return 'sad'
  }

  // 低语/私语
  if (trimmed.startsWith('(') || trimmed.includes('小声') || trimmed.includes('低声')) {
    return 'whisper'
  }

  return 'neutral'
}

/**
 * 检测对话内容
 * 返回说话者类型用于区分语调
 */
export function detectDialogue(text: string): 'narrative' | 'dialogue' | 'thought' {
  // 直接引语
  if (/^["「『]|["」』]$/.test(text.trim())) {
    return 'dialogue'
  }

  // 内心独白
  if (/^[（(]|[)）]$/.test(text.trim()) || text.includes('心想') || text.includes('暗道')) {
    return 'thought'
  }

  return 'narrative'
}

/**
 * 朗读文本预处理
 * 清理不适合朗读的内容
 */
export function preprocessForTTS(text: string): string {
  return text
    // 移除章节标记
    .replace(/^第[一二三四五六七八九十百千\d]+章\s*/g, '')
    // 移除分隔符
    .replace(/[—]{2,}/g, '')
    .replace(/[…]{2,}/g, '……')
    // 移除网址
    .replace(/https?:\/\/[^\s]+/g, '')
    // 移除表情符号
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    // 多空格合并
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 智能语速计算
 * 根据文本复杂度动态调整
 */
export function calculateSmartRate(text: string, baseRate: number = 1.0): number {
  // 长句减速
  if (text.length > 100) {
    return baseRate * 0.95
  }

  // 短句加速
  if (text.length < 30) {
    return baseRate * 1.05
  }

  // 含数字减速
  if (/\d+/.test(text)) {
    return baseRate * 0.9
  }

  return baseRate
}

/**
 * 朗读队列管理
 */
export function useTTSQueue() {
  const queue = ref<string[]>([])
  const currentIndex = ref(0)
  const isPlaying = ref(false)

  const hasNext = computed(() => currentIndex.value < queue.value.length - 1)
  const hasPrevious = computed(() => currentIndex.value > 0)
  const progress = computed(() =>
    queue.value.length > 0 ? (currentIndex.value / queue.value.length) * 100 : 0
  )

  function setQueue(segments: string[]) {
    queue.value = segments
    currentIndex.value = 0
  }

  function getCurrent(): string | null {
    return queue.value[currentIndex.value] || null
  }

  function next(): string | null {
    if (hasNext.value) {
      currentIndex.value++
      return getCurrent()
    }
    return null
  }

  function previous(): string | null {
    if (hasPrevious.value) {
      currentIndex.value--
      return getCurrent()
    }
    return null
  }

  function reset() {
    queue.value = []
    currentIndex.value = 0
    isPlaying.value = false
  }

  return {
    queue,
    currentIndex,
    isPlaying,
    hasNext,
    hasPrevious,
    progress,
    setQueue,
    getCurrent,
    next,
    previous,
    reset,
  }
}

/**
 * 导出组合式函数
 */
export function useTTSSmart() {
  return {
    smartSegment,
    detectSentiment,
    detectDialogue,
    preprocessForTTS,
    calculateSmartRate,
    SENTIMENT_VOICE_MAP,
    ...useTTSQueue(),
  }
}
