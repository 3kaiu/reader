import type { Ref } from 'vue'
import type { useEyeCare } from '@/composables/useEyeCare'
import type { useDecoderStore } from '@/stores/decoder'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'
import type {
  ReaderContentInstance,
  ReaderContentStyle,
} from './types'

export type ReaderExperienceModelServiceOptions = {
  contentRef: Ref<ReaderContentInstance>
  activeBookUrl: Readonly<Ref<string>>
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  eyeCare: ReturnType<typeof useEyeCare>
  decoderAddonEnabled: boolean
  isFullscreen: Ref<boolean>
  contentStyle: Readonly<Ref<ReaderContentStyle>>
  isNightMode: Readonly<Ref<boolean>>
  formattedTime: Readonly<Ref<string>>
}
