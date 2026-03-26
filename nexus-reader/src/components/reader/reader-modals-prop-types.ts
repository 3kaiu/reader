import type { ReaderKeyboardShortcut } from '@/composables/reader/shared-types'
import type { Book, Chapter } from '@/types/book'

export interface ReaderModalsProps {
  showCatalog: boolean
  showSettings: boolean
  showSourcePicker: boolean
  showBookInfo: boolean
  showKeyboardHelp: boolean
  book?: Book | null
  chapters?: Chapter[]
  currentInd?: number
  catalogLoading?: boolean
  isCached?: (index: number) => boolean
  isDownloading?: boolean
  downloadProgress?: { current: number, total: number }
  keyboardShortcuts: ReaderKeyboardShortcut[]
}
