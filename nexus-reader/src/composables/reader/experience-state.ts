import { computed } from 'vue'
import { KEYBOARD_SHORTCUTS } from '@/constants/reader'
import type { ReaderExperienceState } from './experience-state-types'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'

type ReaderExperienceStateOptions =
  ReaderExperienceModelServiceOptions &
  ReaderExperienceModelVisibilityOptions

export function createReaderExperienceState(
  options: ReaderExperienceStateOptions,
) {
  return computed<ReaderExperienceState>(() => ({
    readerStore: options.readerStore,
    settingsStore: options.settingsStore,
    decoderStore: options.decoderStore,
    eyeCare: options.eyeCare,
    activeBookUrl: options.activeBookUrl.value,
    decoderAddonEnabled: options.decoderAddonEnabled,
    showToolbar: options.showToolbar.value,
    showCatalog: options.showCatalog.value,
    showSettings: options.showSettings.value,
    showSourcePicker: options.showSourcePicker.value,
    showBookInfo: options.showBookInfo.value,
    showKeyboardHelp: options.showKeyboardHelp.value,
    showDecoderSettings: options.showDecoderSettings.value,
    isFullscreen: options.isFullscreen.value,
    contentStyle: options.contentStyle.value,
    isNightMode: options.isNightMode.value,
    formattedTime: options.formattedTime.value,
    keyboardShortcuts: KEYBOARD_SHORTCUTS,
  }))
}
