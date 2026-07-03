import { computed } from 'vue'
import type { ReaderPageModelStateOptions } from './page-model-types'
import type { ReaderPageState } from './page-model-types'

export function createReaderPageState(options: ReaderPageModelStateOptions) {
  return computed<ReaderPageState>(() => ({
    themeClass: `theme-${options.currentTheme.value}`,
    readerThemeStyle: options.readerThemeStyle.value,
    isLoading: options.isLoading.value,
    error: options.error.value,
    errorDetails: options.errorDetails.value,
  }))
}
