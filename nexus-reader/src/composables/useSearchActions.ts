import { ref, type Ref } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import { useOpenReader } from '@/composables/useOpenReader'
import { useLibraryStore } from '@/stores/library'
import { useSearchStore } from '@/stores/search'
import type { SearchResult } from '@/types/search'

export function useSearchActions(options: {
  searchKeyword: Ref<string>
  bookUrls: Ref<Set<string>>
  libraryStore: ReturnType<typeof useLibraryStore>
  searchStore: ReturnType<typeof useSearchStore>
  warning: (message: string) => void
  success: (message: string) => void
  showError: (message: string) => void
  handleApiError: (response: ApiResponse<unknown>, fallbackMessage?: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}) {
  const { openReader } = useOpenReader()
  const openingBook = ref<string | null>(null)

  function hasBookOnShelf(bookUrl: string) {
    return options.bookUrls.value.has(bookUrl)
  }

  function scrollSearchResultToTop() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    })
  }

  function stopSearch() {
    options.searchStore.stopSearch()
  }

  async function search(keyword?: string) {
    const query = (keyword || options.searchKeyword.value).trim()
    if (!query) {
      options.warning('请输入搜索关键词')
      return
    }

    scrollSearchResultToTop()

    const outcome = await options.searchStore.search(query)
    if (!outcome) {
      return
    }

    if (outcome.type === 'api_error') {
      options.handleApiError(outcome.response, '搜索失败')
      return
    }

    if (outcome.type === 'exception') {
      options.handlePromiseError(outcome.error, '搜索失败')
    }
  }

  async function addToShelf(book: SearchResult) {
    if (hasBookOnShelf(book.bookUrl)) {
      return
    }

    try {
      const result = await options.libraryStore.ensureBook({
        sourceId: book.sourceId,
        bookUrl: book.bookUrl,
        name: book.name,
        author: book.author,
        coverUrl: book.coverUrl,
      })

      if (result.status === 'added') {
        options.success(`《${book.name}》已添加到书架`)
        return
      }

      if (result.status === 'existing') {
        options.success(`《${book.name}》已在书架`)
        return
      }

      options.showError(result.errorMsg || '添加失败')
    } catch (cause) {
      options.handlePromiseError(cause, '添加失败')
    }
  }

  async function openBook(book: SearchResult) {
    if (openingBook.value === book.bookUrl) {
      return
    }

    openingBook.value = book.bookUrl

    try {
      const result = await openReader(book, { ensureOnShelf: true })
      if (!result.navigated) {
        options.showError(result.ensureResult?.errorMsg || '加入书架失败')
      }
    } catch (cause) {
      options.handlePromiseError(cause, '打开书籍失败')
    } finally {
      openingBook.value = null
    }
  }

  function clearHistory() {
    options.searchStore.clearHistory()
  }

  function toggleSource(source: string) {
    options.searchStore.toggleSource(source)
  }

  function clearSourceFilter() {
    options.searchStore.clearSourceFilter()
  }

  function resetSearch() {
    options.searchStore.reset()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return {
    openingBook,
    hasBookOnShelf,
    stopSearch,
    search,
    addToShelf,
    openBook,
    clearHistory,
    toggleSource,
    clearSourceFilter,
    resetSearch,
  }
}
