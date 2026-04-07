import { computed } from 'vue'
import type { ReaderPageModelStateOptions } from './page-model-state-options'
import type { ReaderPageState } from './page-state-types'

export function createReaderPageState(
  options: ReaderPageModelStateOptions,
) {
  return computed<ReaderPageState>(() => ({
    themeClass: `theme-${options.currentTheme.value}`,
    readerThemeStyle: options.readerThemeStyle.value,
    isLoading: options.isLoading.value,
    error: options.error.value,
    errorDetails: options.errorDetails.value,
  }))
}
