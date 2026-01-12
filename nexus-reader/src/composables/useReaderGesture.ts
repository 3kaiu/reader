/**
 * 👆 useReaderGesture - 阅读器交互手势逻辑
 */
import { onLongPress } from '@vueuse/core'
import type { Ref } from 'vue'

interface ReaderGestureOptions {
  onToggleToolbar: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onLongPress?: (e: MouseEvent | TouchEvent) => void
  containerRef: Ref<HTMLElement | null>
  readingMode: 'scroll' | 'swipe'
  zenMode: boolean
}

export function useReaderGesture(options: ReaderGestureOptions) {
  const {
    onToggleToolbar,
    onPrevPage,
    onNextPage,
    onLongPress: onLongPressCb,
    containerRef,
    readingMode,
    zenMode
  } = options

  // 处理点击区域
  function handleAreaClick(e: MouseEvent | TouchEvent) {
    if (zenMode) return // 禅模式下交给双击

    const x = 'clientX' in e ? e.clientX : e.touches[0].clientX
    const width = window.innerWidth

    // 划分点击区域: 左 30%, 中 40%, 右 30%
    if (x < width * 0.3) {
      if (readingMode === 'swipe') {
        onPrevPage()
      } else {
        onToggleToolbar()
      }
    } else if (x > width * 0.7) {
      if (readingMode === 'swipe') {
        onNextPage()
      } else {
        onToggleToolbar()
      }
    } else {
      onToggleToolbar()
    }
  }

  // 长按处理
  if (onLongPressCb && containerRef) {
    onLongPress(containerRef, onLongPressCb, { delay: 500 })
  }

  return {
    handleAreaClick,
  }
}
