import { computed, nextTick } from 'vue'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'

type ReaderToast = (payload: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}) => unknown

export function useReaderActions(options: {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  toast: ReaderToast
  nextPage: () => Promise<void>
  prevPage: () => Promise<void>
}) {
  const contentStyle = computed(() => ({
    fontSize: `${options.settingsStore.config.fontSize}px`,
    lineHeight: options.settingsStore.config.lineHeight,
    fontWeight: options.settingsStore.config.fontWeight,
    fontFamily: options.settingsStore.currentFontFamily,
    color: options.settingsStore.themeColors.text,
    maxWidth: `${options.settingsStore.config.pageWidth}px`,
    '--custom-bg': options.settingsStore.themeColors.bg,
    '--custom-text': options.settingsStore.themeColors.text,
  }))

  const readerThemeStyle = computed(() =>
    options.settingsStore.config.theme === 'custom'
      ? {
          backgroundColor: options.settingsStore.config.customColors.bg,
          color: options.settingsStore.config.customColors.text,
        }
      : {}
  )

  const isNightMode = computed(() => options.settingsStore.config.theme === 'night')

  function toggleDayNight() {
    options.settingsStore.updateConfig(
      'theme',
      isNightMode.value ? 'white' : 'night'
    )
  }

  function scrollToTop(behavior: ScrollBehavior = 'smooth') {
    window.scrollTo({ top: 0, behavior })
  }

  async function handlePrevChapter() {
    if (options.settingsStore.config.readingMode === 'swipe') {
      return await options.prevPage()
    }

    if (!options.readerStore.hasPrevChapter) {
      return
    }

    await options.readerStore.prevChapter()
    scrollToTop()
  }

  async function handleNextChapter() {
    if (options.settingsStore.config.readingMode === 'swipe') {
      return await options.nextPage()
    }

    if (!options.readerStore.hasNextChapter) {
      return
    }

    await options.readerStore.nextChapter()
    scrollToTop()
  }

  async function handleRefresh() {
    try {
      const scrollRatio = await options.readerStore.refreshChapter()
      await nextTick()

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newScrollHeight =
            document.documentElement.scrollHeight - window.innerHeight
          window.scrollTo({
            top: scrollRatio * newScrollHeight,
            behavior: 'auto',
          })
        })
      })
    } catch (error) {
      options.toast({
        title: '刷新失败',
        description: error instanceof Error ? error.message : '章节刷新失败',
        duration: 3000,
      })
    }
  }

  async function handleSelectChapter(index: number) {
    if (options.settingsStore.config.readingMode === 'scroll') {
      await options.readerStore.goToChapterInScroll(index)
      await nextTick()

      const chapterMarker = document.querySelector(
        `[data-chapter-index='${index}']`
      )

      if (chapterMarker instanceof HTMLElement) {
        chapterMarker.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
        return
      }
    } else {
      await options.readerStore.goToChapter(index)
    }

    scrollToTop()
  }

  return {
    contentStyle,
    readerThemeStyle,
    isNightMode,
    toggleDayNight,
    handlePrevChapter,
    handleNextChapter,
    handleRefresh,
    handleSelectChapter,
  }
}
