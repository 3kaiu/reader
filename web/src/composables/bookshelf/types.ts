import type { Ref } from 'vue'
import type { Book } from '@/types/book'
import type { BookshelfBook } from '@/utils/bookshelf'
import { useAddonsStore } from '@/stores/addons'
import { useLibraryStore } from '@/stores/library'
import { useOfflineStore } from '@/stores/offlineStorage'

export interface BookshelfActionsOptions {
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
}

export type BookshelfOpenReader = (book: Book) => Promise<unknown>
