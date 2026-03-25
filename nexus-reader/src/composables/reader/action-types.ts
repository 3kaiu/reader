import type { ReaderToast } from './types'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'

export interface ReaderActionOptions {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  toast: ReaderToast
}
