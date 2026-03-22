import { onMounted, onUnmounted, watch } from 'vue'
import { useScroll, useThrottleFn } from '@vueuse/core'
import { logger } from '@/utils/logger'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'

export function useReaderScrollSync(options: {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
}) {
  const { arrivedState } = useScroll(window, { offset: { bottom: 200 } })
  const handleBeforeUnload = () => options.readerStore.saveProgress()

  const debouncedAppendNext = useThrottleFn(async () => {
    if (options.readerStore.hasNextChapter && !options.readerStore.isLoadingMore) {
      const success = await options.readerStore.appendNextChapter()
      if (!success) {
        logger.warn('自动加载下一章失败，显示重试选项', {
          loadError: options.readerStore.loadError,
        })
      }
    }
  }, 1000)

  const debouncedChapterSync = useThrottleFn(() => {
    if (options.settingsStore.config.readingMode === 'scroll') {
      options.readerStore.updateChapterIndexByScroll()
    }
  }, 500)

  watch(
    () => arrivedState.bottom,
    (isBottom) => {
      if (isBottom && options.settingsStore.config.readingMode === 'scroll') {
        if (!options.readerStore.loadError) {
          debouncedAppendNext()
        }
      }
    }
  )

  onMounted(() => {
    window.addEventListener('scroll', debouncedChapterSync, { passive: true })
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', debouncedChapterSync)
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}
