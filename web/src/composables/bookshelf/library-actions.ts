import type { Book } from '@/types/book'
import type { BookshelfBook } from '@/utils/bookshelf'
import type { BookshelfActionsOptions, BookshelfOpenReader } from './types'
import { createManageModeDeleteActions } from '@/composables/manage-mode/management'
import type { ManageModeDeleteDeps } from '@/composables/manage-mode/management'

export function createBookshelfLibraryActions(
  options: BookshelfActionsOptions,
  openReader: BookshelfOpenReader
) {
  async function openBook(book: Book) {
    if (options.isManageMode.value) {
      options.toggleSelect(book as BookshelfBook)
      return
    }

    await openReader(book)
  }

  // Single and batch delete via generic manage-mode layer
  const deps: ManageModeDeleteDeps<BookshelfBook, string> = {
    name: book => book.name,
    getKey: book => book.id!,
    selectedKeys: options.selectedBooks as any,
    setSelection: options.setSelection,
    toggleManageMode: options.toggleManageMode,
    confirm: options.confirm,
    success: options.success,
    error: options.warning,
    warning: options.warning,
    handlePromiseError: options.handlePromiseError,
    deleteByIds: ids => options.libraryStore.deleteBookIds(ids),
  }
  const { deleteItem, batchDelete } = createManageModeDeleteActions(deps)

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

  return {
    openBook,
    batchDelete,
    handleMoveConfirm,
    handleDelete: deleteItem,
  }
}