import type { Router } from 'vue-router'
import type { ReaderToast } from './shared-types'
import type { useSettingsStore } from '@/stores/settings'

export interface ReaderChromeActionOptions {
  router: Router
  settingsStore: ReturnType<typeof useSettingsStore>
  toast: ReaderToast
}
