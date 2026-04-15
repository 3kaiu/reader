import { computed, ref, watch } from 'vue'
import { useLibraryStore } from '@/stores/library'
import { useOpenReader } from '@/composables/useOpenReader'
import { useMessage } from '@/composables/useMessage'
import { useReaderStore } from '@/stores/reader'
import type { Book } from '@/types/book'
import { logger } from '@/utils/logger'

type BookInfoViewProps = {
  open?: boolean
  bookUrl?: string
  initialBook?: Book | null
}

export function useBookInfoView(options: {
  props: BookInfoViewProps
  close: () => void
  notifyShelfUpdated: () => void
}) {
  const message = useMessage()
  const libraryStore = useLibraryStore()
  const readerStore = useReaderStore()
  const { openReader } = useOpenReader()

  const loading = ref(false)
  const info = ref<Book | null>(null)

  const displayBook = computed(() => info.value || options.props.initialBook || null)

  async function loadInfo() {
    if (!options.props.bookUrl) {
      return
    }

    loading.value = true
    try {
      const sourceId = options.props.initialBook?.sourceId
      if (!sourceId) {
        return
      }

      const response = await readerStore.fetchBookInfo(sourceId, options.props.bookUrl)
      if (response.isSuccess && response.data) {
        info.value = response.data
      }
    } catch (error) {
      logger.error('加载书籍信息失败', {
        component: 'BookInfoModal',
        bookUrl: options.props.bookUrl,
        error,
      })
    } finally {
      loading.value = false
    }
  }

  async function addToShelf() {
    if (!displayBook.value) {
      return
    }

    try {
      const result = await libraryStore.ensureBook(displayBook.value)
      if (result.status === 'added') {
        message.success('加入书架成功')
        options.notifyShelfUpdated()
        info.value = result.book || displayBook.value
        return
      }

      if (result.status === 'existing') {
        message.success('该书已在书架')
        return
      }

      message.error(result.errorMsg || '操作失败')
    } catch {
      message.error('操作失败')
    }
  }

  async function startReading() {
    if (!displayBook.value) {
      return
    }

    if (readerStore.isCurrentBookTarget(displayBook.value)) {
      options.close()
      return
    }

    try {
      await openReader(displayBook.value, { preload: true })
      options.close()
    } catch {
      message.error('打开书籍失败')
    }
  }

  function formatIntro(intro?: string) {
    if (!intro) {
      return '暂无简介'
    }

    return intro.replace(/\s+/g, '\n').trim()
  }

  watch(
    () => options.props.open,
    open => {
      if (open && options.props.bookUrl) {
        void loadInfo()
      }
    }
  )

  watch(
    () => options.props.initialBook,
    initialBook => {
      if (initialBook) {
        info.value = initialBook
      }
    },
    { immediate: true }
  )

  return {
    loading,
    info,
    displayBook,
    loadInfo,
    addToShelf,
    startReading,
    formatIntro,
  }
}
