import type { useEyeCare } from '@/composables/useEyeCare'
import type { useDecoderStore } from '@/stores/decoder'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'
import type {
  ReaderContentStyle,
  ReaderKeyboardShortcut,
} from './shared-types'

export interface ReaderExperienceState {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  eyeCare: ReturnType<typeof useEyeCare>
  activeBookUrl: string
  decoderAddonEnabled: boolean
  showToolbar: boolean
  showCatalog: boolean
  showSettings: boolean
  showSourcePicker: boolean
  showBookInfo: boolean
  showKeyboardHelp: boolean
  showDecoderSettings: boolean
  isFullscreen: boolean
  contentStyle: ReaderContentStyle
  isNightMode: boolean
  formattedTime: string
  keyboardShortcuts: ReaderKeyboardShortcut[]
}
