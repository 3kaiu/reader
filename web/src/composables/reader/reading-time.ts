import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Ref, ComputedRef } from 'vue'

/**
 * 阅读时间系统 — 估算阅读时长 + 实时剩余时间更新
 *
 * 估算: 总字符数 ÷ 400 字符/分钟
 * 实时剩余: 阅读时间 × (1 - 进度%)
 */

/**
 * 便捷 composable — 用于组件中直接获取阅读时间显示值
 * 自动响应滚动位置更新 remainingMinutes
 */
export function useReadingTimeDisplay(formattedContent: Ref<string> | ComputedRef<string>) {
  const totalChars = computed(() => {
    const html = formattedContent.value
    if (!html) return 0
    // Strip HTML tags to count only visible text characters
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').length
  })
  const totalMinutes = computed(() => {
    const charCount = totalChars.value
    return Math.max(1, Math.round(charCount / 400))
  })

  const remainingMinutes = ref(totalMinutes.value)
  let ticking = false

  const updateRemaining = () => {
    const docH = document.documentElement.scrollHeight - window.innerHeight
    if (docH <= 0) {
      remainingMinutes.value = totalMinutes.value
      return
    }
    const progress = Math.min(1, window.scrollY / docH)
    remainingMinutes.value = Math.max(1, Math.round(totalMinutes.value * (1 - progress)))
  }

  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      updateRemaining()
      ticking = false
    })
  }

  onMounted(() => {
    updateRemaining()
    window.addEventListener('scroll', onScroll, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
  })

  return { totalMinutes, remainingMinutes }
}
