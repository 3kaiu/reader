import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useOpenReader } from '@/composables/useOpenReader'
import type { OptionalFeature } from '@/utils/features'
import type { Book } from '@/types/book'
import type { BookshelfBook } from '@/utils/bookshelf'
import { useAddonsStore } from '@/stores/addons'
import { useLibraryStore } from '@/stores/library'
import { useOfflineStore } from '@/stores/offlineStorage'

export function useBookshelfActions(options: {
  isManageMode: Ref<boolean>
  selectedBooks: Ref<Set<string>>
  setSelection: (ids: Iterable<string>) => void
  toggleSelect: (book: BookshelfBook) => void
  toggleManageMode: (force?: boolean) => void
  success: (message: string) => void
  warning: (message: string) => void
  confirm: (options: {
    title: string
    description?: string
    variant?: 'default' | 'destructive'
  }) => Promise<boolean>
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
  addonsStore: ReturnType<typeof useAddonsStore>
  libraryStore: ReturnType<typeof useLibraryStore>
  offlineStore: ReturnType<typeof useOfflineStore>
}) {
  const router = useRouter()
  const { openReader } = useOpenReader()

  function isFeatureEnabled(feature: OptionalFeature) {
    return options.addonsStore.features[feature]
  }

  async function openBook(book: Book) {
    if (options.isManageMode.value) {
      options.toggleSelect(book as BookshelfBook)
      return
    }

    await openReader(book)
  }

  async function batchDelete() {
    if (options.selectedBooks.value.size === 0) {
      return
    }

    const confirmed = await options.confirm({
      title: '确认删除',
      description: `确定要删除选中的 ${options.selectedBooks.value.size} 本书籍吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await options.libraryStore.deleteBookIds(options.selectedBooks.value)
      if (result.status === 'deleted') {
        options.toggleManageMode(false)
        options.success('删除成功')
        return
      }

      if (result.status === 'partial') {
        if (result.remainingIds.length > 0) {
          options.setSelection(result.remainingIds)
        } else {
          options.toggleManageMode(false)
        }

        options.warning(`已删除 ${result.deletedCount} 本书籍，${result.failedCount} 本删除失败`)
        return
      }

      options.warning(result.errorMsg || '批量删除失败')
    } catch (cause) {
      options.handlePromiseError(cause, '批量删除失败')
    }
  }

  async function handleMoveConfirm(groupId: string | null) {
    if (options.selectedBooks.value.size === 0) {
      return
    }

    try {
      const response = await options.libraryStore.moveBookIdsToGroup(
        groupId,
        options.selectedBooks.value
      )
      if (response.isSuccess) {
        options.success('移动成功')
        options.toggleManageMode(false)
        return
      }

      options.warning(response.errorMsg || '移动失败')
    } catch (cause) {
      options.handlePromiseError(cause, '移动失败')
    }
  }

  async function handleDelete(book: Book) {
    if (!book.id) {
      options.warning('书籍缺少 ID，无法删除')
      return
    }

    const confirmed = await options.confirm({
      title: '确认删除',
      description: `确定要删除《${book.name}》吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await options.libraryStore.deleteBookIds([book.id])
      if (result.status === 'deleted') {
        options.success('删除成功')
        return
      }

      options.warning(result.errorMsg || '删除失败')
    } catch (cause) {
      options.handlePromiseError(cause, '删除失败')
    }
  }

  function goSearch() {
    void router.push('/search')
  }

  function goDiscovery() {
    void router.push('/discovery')
  }

  function navigateTo(path: string) {
    void router.push(path)
  }

  async function hydrateBookshelf() {
    options.addonsStore.refresh()
    await Promise.allSettled([
      options.libraryStore.hydrate(),
      options.offlineStore.loadCacheIndex(),
    ])
  }

  return {
    isFeatureEnabled,
    openBook,
    batchDelete,
    handleMoveConfirm,
    handleDelete,
    navigateTo,
    goDiscovery,
    goSearch,
    hydrateBookshelf,
  }
}
