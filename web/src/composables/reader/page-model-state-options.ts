import type { Ref } from 'vue'
import type { ReaderThemeStyle } from './shared-types'

export type ReaderPageModelStateOptions = {
  readerThemeStyle: Readonly<Ref<ReaderThemeStyle>>
  currentTheme: Readonly<Ref<string>>
  isLoading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null | undefined>>
  errorDetails: Readonly<Ref<string | null | undefined>>
}
