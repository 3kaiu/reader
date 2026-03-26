import type { Router } from 'vue-router'
import type { ReaderToast } from './shared-types'
import type { useDecoderStore } from '@/stores/decoder'
import type { useSettingsStore } from '@/stores/settings'

export interface ReaderChromeActionOptions {
  router: Router
  settingsStore: ReturnType<typeof useSettingsStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  decoderAddonEnabled: boolean
  toast: ReaderToast
}
