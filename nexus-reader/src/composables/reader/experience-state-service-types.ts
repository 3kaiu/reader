import type { useEyeCare } from '@/composables/useEyeCare'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'

export interface ReaderExperienceServiceState {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  eyeCare: ReturnType<typeof useEyeCare>
  activeBookUrl: string
}
