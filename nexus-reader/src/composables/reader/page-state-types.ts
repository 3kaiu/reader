import type { ReaderThemeStyle } from './shared-types'

export interface ReaderPageState {
  themeClass: string
  readerThemeStyle: ReaderThemeStyle
  isLoading: boolean
  error: string | null | undefined
  errorDetails: string | null | undefined
}
