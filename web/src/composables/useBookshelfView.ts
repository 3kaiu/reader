import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBookshelfActions } from '@/composables/useBookshelfActions'
import { useBookshelfCollections } from '@/composables/useBookshelfCollections'
import { useBookshelfUiState } from '@/composables/useBookshelfUiState'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useManageSelection } from '@/composables/useManageSelection'
import { useMessage } from '@/composables/useMessage'
import { useLibraryStore } from '@/stores/library'
import { useOfflineStore } from '@/stores/offlineStorage'
import type { BookshelfBook } from '@/utils/bookshelf'

export function useBookshelfView() {
  const offlineStore = useOfflineStore()
  const libraryStore = useLibraryStore()
  const { books, groups, isInitialLoading } = storeToRefs(libraryStore)
  const { success, warning } = useMessage()
  const { confirm } = useConfirm()
  const { handlePromiseError } = useErrorHandler()
  const {
    isDark,
    toggleDark,
    showProgress,
    menuOpen,
    showMoveDialog,
    currentGroupId,
    isDesktop,
    menuGroups,
  } = useBookshelfUiState()

  const { booksWithStatus, nonEmptyGroups, recentBooks, otherBooks, hasBooks } =
    useBookshelfCollections({
      books,
      groups,
      currentGroupId,
      offlineStore,
    })
  const {
    isManageMode,
    selectedKeys: selectedBooks,
    setSelection,
    toggleSelect,
    selectAll,
    toggleManageMode,
  } = useManageSelection<BookshelfBook, string>(
    book => book.id,
    () => booksWithStatus.value
  )
  const {
    openBook,
    batchDelete,
    handleMoveConfirm,
    handleDelete,
    navigateTo,
    goSearch,
    hydrateBookshelf,
  } = useBookshelfActions({
    isManageMode,
    selectedBooks,
    setSelection,
    toggleSelect,
    toggleManageMode,
    success,
    warning,
    confirm,
    handlePromiseError,
    libraryStore,
    offlineStore,
  })

  const loading = computed(() => isInitialLoading.value)
  const allBooksSelected = computed(
    () => hasBooks.value && selectedBooks.value.size === booksWithStatus.value.length
  )

  onMounted(() => {
    void hydrateBookshelf()
  })

  return {
    isDark,
    toggleDark,
    showProgress,
    menuOpen,
    isDesktop,
    menuGroups,
    loading,
    books,
    groups,
    booksWithStatus,
    nonEmptyGroups,
    currentGroupId,
    recentBooks,
    otherBooks,
    hasBooks,
    allBooksSelected,
    isManageMode,
    selectedBooks,
    selectAll,
    toggleManageMode,
    showMoveDialog,
    openBook,
    batchDelete,
    handleMoveConfirm,
    handleDelete,
    navigateTo,
    goSearch,
  }
}
