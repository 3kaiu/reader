import { computed } from 'vue'
import type { ReaderPageState } from './types'
import type { ReaderPageModelOptions } from './page-model-types'

export function createReaderPageState(
  options: ReaderPageModelOptions,
) {
  return computed<ReaderPageState>(() => ({
    themeClass: `theme-${options.currentTheme.value}`,
    readerThemeStyle: options.readerThemeStyle.value,
    isLoading: options.isLoading.value,
    error: options.error.value,
  }))
}
