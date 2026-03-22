import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  buildSwipeLayout,
  getSwipeTotalPages,
} from '@/utils/swipeMode'

type SwipeModeDeps = {
  readerStore: {
    formattedContent?: string
    content?: string
    currentChapterIndex: number
    hasNextChapter: boolean
    hasPrevChapter: boolean
    nextChapter: () => Promise<void>
    prevChapter: () => Promise<void>
    initInfiniteScroll?: () => void
  }
  settingsStore: {
    config: {
      fontSize: number
      lineHeight: number
      readingMode: 'scroll' | 'swipe'
      pageAnimation: 'slide' | 'fade' | 'none'
    }
  }
  toggleToolbar?: () => void
}

export function useSwipeMode({
  readerStore,
  settingsStore,
  toggleToolbar,
}: SwipeModeDeps) {
  const contentRef = ref<HTMLElement | null>(null)
  const page = ref(0)
  const viewportWidth = ref(
    typeof window !== 'undefined' ? window.innerWidth : 375
  )
  const viewportHeight = ref(
    typeof window !== 'undefined' ? window.innerHeight : 667
  )

  const layout = computed(() => buildSwipeLayout(viewportWidth.value))

  const totalPages = computed(() => {
    if (settingsStore.config.readingMode !== 'swipe') {
      return 1
    }

    return getSwipeTotalPages({
      content: readerStore.formattedContent || readerStore.content || '',
      width: viewportWidth.value,
      height: viewportHeight.value,
      fontSize: settingsStore.config.fontSize || 18,
      lineHeight: settingsStore.config.lineHeight || 1.8,
    })
  })

  const syncViewport = () => {
    viewportWidth.value = window.innerWidth
    viewportHeight.value = window.innerHeight
  }

  watch(
    () => readerStore.currentChapterIndex,
    () => {
      page.value = 0
    },
  )

  watch(totalPages, (value) => {
    if (page.value >= value) {
      page.value = Math.max(0, value - 1)
    }
  })

  const nextPage = async () => {
    if (page.value < totalPages.value - 1) {
      page.value += 1
      return
    }

    if (!readerStore.hasNextChapter) {
      return
    }

    await readerStore.nextChapter()
    readerStore.initInfiniteScroll?.()
    page.value = 0
  }

  const prevPage = async () => {
    if (page.value > 0) {
      page.value -= 1
      return
    }

    if (!readerStore.hasPrevChapter) {
      return
    }

    await readerStore.prevChapter()
    readerStore.initInfiniteScroll?.()
    await nextTick()
    page.value = Math.max(0, totalPages.value - 1)
  }

  const handleClick = (event: MouseEvent) => {
    const clickRatio = window.innerWidth > 0 ? event.clientX / window.innerWidth : 0.5

    if (clickRatio <= 0.3) {
      void prevPage()
      return
    }

    if (clickRatio >= 0.7) {
      void nextPage()
      return
    }

    toggleToolbar?.()
  }

  onMounted(() => {
    syncViewport()
    window.addEventListener('resize', syncViewport, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('resize', syncViewport)
  })

  return {
    contentRef,
    page,
    totalPages,
    layout,
    handleClick,
    nextPage,
    prevPage,
  }
}
