import { computed, type Ref } from 'vue'
import type { Book } from '@/types/book'
import type { BookGroup } from '@/types/group'
import type { useOfflineStore } from '@/stores/offlineStorage'
import {
  deduplicateBooks,
  filterNonEmptyGroups,
  sortBooksByLastRead,
  type BookshelfBook,
} from '@/utils/bookshelf'

export function useBookshelfCollections(options: {
  books: Ref<Book[]>
  groups: Ref<BookGroup[]>
  currentGroupId: Ref<string | number>
  offlineStore: ReturnType<typeof useOfflineStore>
}) {
  const deduplicatedBooks = computed(() => deduplicateBooks(options.books.value))
  const booksWithStatus = computed<BookshelfBook[]>(() =>
    deduplicatedBooks.value.map(({ book, sourceCount }) => {
      const cacheStatus = options.offlineStore.getBookCacheStatus(
        book.bookUrl,
        book.totalChapterNum || 0
      )

      return {
        ...book,
        sourceCount,
        cachePercent: cacheStatus.percentage,
        isFullyCached:
          cacheStatus.cached >= (book.totalChapterNum || 0) && (book.totalChapterNum || 0) > 0,
      }
    })
  )

  const nonEmptyGroups = computed(() =>
    filterNonEmptyGroups(options.groups.value, options.books.value)
  )
  const sortedBooks = computed(() => {
    const filteredBooks =
      options.currentGroupId.value === 'all'
        ? booksWithStatus.value
        : booksWithStatus.value.filter(book => book.groupId === options.currentGroupId.value)

    return sortBooksByLastRead(filteredBooks)
  })
  const recentBooks = computed(() => sortedBooks.value.slice(0, 4))
  const otherBooks = computed(() => sortedBooks.value.slice(4))
  const hasBooks = computed(() => booksWithStatus.value.length > 0)

  return {
    booksWithStatus,
    nonEmptyGroups,
    recentBooks,
    otherBooks,
    hasBooks,
  }
}
