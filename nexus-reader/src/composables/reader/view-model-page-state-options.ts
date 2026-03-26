import { computed } from 'vue'
import type { ReaderPageModelStateOptions } from './page-model-state-options'
import type { ReaderViewServices } from './view-dependencies'
import type { ReaderPageModelFeatures } from './view-model-page-feature-types'

export function createReaderPageModelStateOptions(
  services: ReaderViewServices,
  features: ReaderPageModelFeatures,
): ReaderPageModelStateOptions {
  const currentTheme = computed(() => services.settingsStore.config.theme)
  const isLoading = computed(() => services.readerStore.isLoading)
  const error = computed(() => services.readerStore.error)

  return {
    readerThemeStyle: features.actions.readerThemeStyle,
    currentTheme,
    isLoading,
    error,
  }
}
