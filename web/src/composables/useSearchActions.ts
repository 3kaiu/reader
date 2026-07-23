import { ref, type Ref } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import { useOpenReader } from '@/composables/useOpenReader'
import type { useLibraryStore } from '@/stores/library'
import type { useSearchStore } from '@/stores/search'
import type { Book } from '@/types/book'
import type { SearchResult, SearchResultActionPayload } from '@/types/search'
import { getSearchResultIdentity } from '@/stores/search/helpers'

export function useSearchActions(options: {
  searchKeyword: Ref<string>
  books: Ref<Book[]>
  libraryStore: ReturnType<typeof useLibraryStore>
  searchStore: ReturnType<typeof useSearchStore>
  warning: (message: string) => void
  success: (message: string) => void
  showError: (message: string) => void
  handleApiError: (response: ApiResponse<unknown>, fallbackMessage?: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string, showToast?: boolean) => void
}) {
  const { openReader } = useOpenReader()
  const openingBook = ref<string | null>(null)

  function hasBookOnShelf(book: SearchResult) {
    return options.books.value.some(
      shelfBook => shelfBook.sourceId === book.sourceId && shelfBook.bookUrl === book.bookUrl
    )
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

  function normalizeActionPayload(
    payload: SearchResult | SearchResultActionPayload
  ): SearchResultActionPayload {
    if ('book' in payload) {
      return payload
    }

    return {
      book: payload,
    }
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

  async function addToShelf(payload: SearchResult | SearchResultActionPayload) {
    const { book, rememberPreference } = normalizeActionPayload(payload)

    if (hasBookOnShelf(book)) {
      if (rememberPreference) {
        options.searchStore.rememberPreferredSource(book)
      }

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
        if (rememberPreference) {
          options.searchStore.rememberPreferredSource(book)
        }

        options.success(`《${book.name}》已添加到书架`)
        return
      }

      if (result.status === 'existing') {
        if (rememberPreference) {
          options.searchStore.rememberPreferredSource(book)
        }

        options.success(`《${book.name}》已在书架`)
        return
      }

      options.showError(result.errorMsg || '添加失败')
    } catch (cause) {
      options.handlePromiseError(cause, '添加失败')
    }
  }

  async function ensureBookOnShelfInBackground(book: SearchResult) {
    if (hasBookOnShelf(book)) {
      return
    }

    try {
      await options.libraryStore.ensureBook({
        sourceId: book.sourceId,
        bookUrl: book.bookUrl,
        name: book.name,
        author: book.author,
        coverUrl: book.coverUrl,
      })
    } catch (error) {
      // Best effort only. Reading should not be blocked by shelf persistence.
      console.debug('Background shelf persistence failed', { error, bookUrl: book.bookUrl })
    }
  }

  async function openBook(payload: SearchResult | SearchResultActionPayload) {
    const { book, rememberPreference } = normalizeActionPayload(payload)
    const bookIdentity = getSearchResultIdentity(book)

    if (openingBook.value === bookIdentity) {
      return
    }

    openingBook.value = bookIdentity

    try {
      if (rememberPreference) {
        options.searchStore.rememberPreferredSource(book)
      }

      const result = await openReader(book)
      if (!result.navigated) {
        options.showError(`打开《${book.name}》失败，请重试或切换书源`)
        return
      }

      void ensureBookOnShelfInBackground(book)
    } catch (cause) {
      const causeMessage = cause instanceof Error && cause.message ? cause.message.trim() : ''
      const fallbackMessage = causeMessage
        ? `打开《${book.name}》失败：${causeMessage}`
        : `打开《${book.name}》失败，请重试或切换书源`

      options.showError(fallbackMessage)
      options.handlePromiseError(cause, fallbackMessage, false)
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
