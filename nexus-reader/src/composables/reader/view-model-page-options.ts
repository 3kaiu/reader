import { computed } from 'vue'
import type { ReaderExperienceActions } from './experience-action-types'
import type { ReaderPageModelOptions } from './page-model'
import type { ReaderViewFeatures } from './view-features'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'

export function createReaderPageModelOptions(
  services: ReaderViewServices,
  _layout: ReaderViewLayout,
  features: ReaderViewFeatures,
  readerExperienceActions: ReaderExperienceActions,
): ReaderPageModelOptions {
  const currentTheme = computed(() => services.settingsStore.config.theme)
  const isLoading = computed(() => services.readerStore.isLoading)
  const error = computed(() => services.readerStore.error)

  return {
    readerThemeStyle: features.actions.readerThemeStyle,
    currentTheme,
    isLoading,
    error,
    toggleToolbar: features.chrome.toggleToolbar,
    toggleCatalog: features.chrome.toggleCatalog,
    toggleSettings: features.chrome.toggleSettings,
    toggleKeyboardHelp: features.chrome.toggleKeyboardHelp,
    handleEscape: features.chrome.handleEscape,
    openSourcePicker: features.chrome.openSourcePicker,
    readerExperienceActions,
  }
}
