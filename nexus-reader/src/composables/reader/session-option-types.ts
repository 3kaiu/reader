import type { useDecoderStore } from '@/stores/decoder'
import type { useOfflineStore } from '@/stores/offlineStorage'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'
import type { ReaderToast } from './shared-types'

export interface ReaderSessionOptions {
  toast: ReaderToast
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  offlineStore: ReturnType<typeof useOfflineStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  decoderAddonEnabled: boolean
}
