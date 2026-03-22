import { computed, nextTick, ref, watch } from 'vue'
import { useVirtualList } from '@vueuse/core'
import { useMessage } from '@/composables/useMessage'
import type { Chapter } from '@/types/book'

type ChapterListViewProps = {
  open: boolean
  chapters: Chapter[]
  currentInd: number
  loading?: boolean
  bookName?: string
  isCached?: (index: number) => boolean
  isDownloading?: boolean
  downloadProgress?: { current: number; total: number }
}

type FilteredChapterItem = Chapter & {
  originalIndex: number
}

type VirtualChapterItem = {
  index: number
  data: FilteredChapterItem
}

export function useChapterListView(options: {
  props: ChapterListViewProps
  onSelect: (index: number) => void
  onClose: () => void
  onRefresh: () => void
  onDownloadAll: () => void
}) {
  const { warning } = useMessage()

  const searchKeyword = ref('')
  const isReverse = ref(false)

  const filteredChapters = computed<FilteredChapterItem[]>(() => {
    let list = options.props.chapters.map((chapter, index) => ({
      ...chapter,
      originalIndex: index,
    }))

    if (searchKeyword.value) {
      const keyword = searchKeyword.value.toLowerCase()
      list = list.filter(chapter => chapter.title.toLowerCase().includes(keyword))
    }

    if (isReverse.value) {
      list.reverse()
    }

    return list
  })

  const showCacheControls = computed(
    () =>
      typeof options.props.isCached === 'function' ||
      typeof options.props.isDownloading === 'boolean' ||
      !!options.props.downloadProgress
  )

  const currentProgressPercent = computed(() => {
    if (options.props.currentInd < 0 || options.props.chapters.length === 0) {
      return 0
    }

    return Math.round(
      ((options.props.currentInd + 1) / options.props.chapters.length) * 100
    )
  })

  const currentChapterTitle = computed(
    () => options.props.chapters[options.props.currentInd]?.title || ''
  )

  const {
    list,
    containerProps,
    wrapperProps,
    scrollTo,
  } = useVirtualList(filteredChapters, {
    itemHeight: 50,
    overscan: 10,
  })

  function handleSelect(item: VirtualChapterItem) {
    options.onSelect(item.data.originalIndex)
    options.onClose()
  }

  function toggleReverse() {
    isReverse.value = !isReverse.value
  }

  function clearSearch() {
    searchKeyword.value = ''
  }

  function scrollToCurrent() {
    if (options.props.currentInd < 0) {
      return
    }

    const targetIndex = filteredChapters.value.findIndex(
      chapter => chapter.originalIndex === options.props.currentInd
    )
    if (targetIndex !== -1) {
      scrollTo(targetIndex)
      return
    }

    warning('当前章节不在列表中')
  }

  function handleRefresh() {
    options.onRefresh()
  }

  function handleDownloadAll() {
    options.onDownloadAll()
  }

  watch(
    () => options.props.open,
    open => {
      if (!open) {
        return
      }

      nextTick(() => {
        if (!searchKeyword.value) {
          scrollToCurrent()
        }
      })
    }
  )

  return {
    searchKeyword,
    isReverse,
    filteredChapters,
    showCacheControls,
    currentProgressPercent,
    currentChapterTitle,
    list,
    containerProps,
    wrapperProps,
    handleSelect,
    toggleReverse,
    clearSearch,
    scrollToCurrent,
    handleRefresh,
    handleDownloadAll,
  }
}
