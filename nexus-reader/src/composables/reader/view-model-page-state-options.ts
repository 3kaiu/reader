import { computed, unref } from 'vue'
import type { ReaderPageModelStateOptions } from './page-model-state-options'
import type { ReaderViewServices } from './view-dependencies'
import type { ReaderPageModelFeatures } from './view-model-page-feature-types'

export function createReaderPageModelStateOptions(
  services: ReaderViewServices,
  features: ReaderPageModelFeatures
): ReaderPageModelStateOptions {
  const currentTheme = computed(() => services.settingsStore.config.theme)
  const isLoading = computed(() => Boolean(unref(services.readerStore.isLoading as never)))
  const error = computed(
    () =>
      (unref(services.readerStore.error as never) as string | null | undefined) ||
      (unref(services.readerStore.loadError as never) as string | null | undefined)
  )
  const errorDetails = computed(
    () => unref(services.readerStore.loadErrorDetails as never) as string | null | undefined
  )

  return {
    readerThemeStyle: features.actions.readerThemeStyle,
    currentTheme,
    isLoading,
    error,
    errorDetails,
  }
}
