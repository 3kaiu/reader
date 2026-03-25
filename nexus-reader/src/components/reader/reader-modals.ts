import { computed } from 'vue'
import type { ReaderKeyboardShortcut } from '@/composables/reader/types'
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

export type ReaderModalsEmits = {
  'update:showCatalog': [val: boolean]
  'update:showSettings': [val: boolean]
  'update:showSourcePicker': [val: boolean]
  'update:showBookInfo': [val: boolean]
  'update:showKeyboardHelp': [val: boolean]
  'select-chapter': [index: number]
  refresh: []
  'download-all': []
}

type ReaderModalsEmitFn = <EventName extends keyof ReaderModalsEmits>(
  event: EventName,
  ...args: ReaderModalsEmits[EventName]
) => void

export function createReaderModalsBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn,
) {
  const chapterListBindings = computed(() => ({
    open: props.showCatalog,
    chapters: props.chapters ?? [],
    currentInd: props.currentInd ?? -1,
    loading: props.catalogLoading,
    bookName: props.book?.name,
    isCached: props.isCached,
    isDownloading: props.isDownloading,
    downloadProgress: props.downloadProgress,
    'onUpdate:open': (value: boolean) => emit('update:showCatalog', value),
    onSelect: (index: number) => emit('select-chapter', index),
    onRefresh: () => emit('refresh'),
    onDownloadAll: () => emit('download-all'),
  }))

  const settingsBindings = computed(() => ({
    open: props.showSettings,
    'onUpdate:open': (value: boolean) => emit('update:showSettings', value),
  }))

  const sourcePickerBindings = computed(() => ({
    open: props.showSourcePicker,
    'onUpdate:open': (value: boolean) =>
      emit('update:showSourcePicker', value),
  }))

  const bookInfoBindings = computed(() => ({
    open: props.showBookInfo,
    bookUrl: props.book?.bookUrl,
    initialBook: props.book,
    'onUpdate:open': (value: boolean) => emit('update:showBookInfo', value),
  }))

  const keyboardHelpBindings = computed(() => ({
    open: props.showKeyboardHelp,
    shortcuts: props.keyboardShortcuts,
    'onUpdate:open': (value: boolean) =>
      emit('update:showKeyboardHelp', value),
  }))

  return {
    chapterListBindings,
    settingsBindings,
    sourcePickerBindings,
    bookInfoBindings,
    keyboardHelpBindings,
  }
}
