import { computed, unref } from 'vue'
import type { ReaderPageModelStateOptions } from './page-model-types'
import type { ReaderViewServices } from './view-services'

export function createReaderViewPageStateOptions(
  services: ReaderViewServices
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
    currentTheme,
    isLoading,
    error,
    errorDetails,
  }
}
