import type { Ref } from 'vue'
import type { useEyeCare } from '@/composables/useEyeCare'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'
import type { ReaderContentInstance, ReaderContentStyle } from './shared-types'

export type ReaderExperienceModelServiceOptions = {
  contentRef: Ref<ReaderContentInstance>
  activeBookUrl: Readonly<Ref<string>>
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  eyeCare: ReturnType<typeof useEyeCare>
  isFullscreen: Ref<boolean>
  contentStyle: Readonly<Ref<ReaderContentStyle>>
  isNightMode: Readonly<Ref<boolean>>
  formattedTime: Readonly<Ref<string>>
}
