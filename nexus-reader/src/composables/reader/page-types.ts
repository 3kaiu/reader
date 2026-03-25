import type { ReaderThemeStyle } from './shared-types'

export interface ReaderPageState {
  themeClass: string
  readerThemeStyle: ReaderThemeStyle
  isLoading: boolean
  error: string | null | undefined
}

export interface ReaderPageActions {
  toggleToolbar(): void
  handlePrevChapter(): void | Promise<void>
  handleNextChapter(): void | Promise<void>
  toggleFullscreen(): void
  toggleCatalog(): void
  toggleSettings(): void
  toggleDayNight(): void
  toggleZenMode(): void
  toggleKeyboardHelp(): void
  handleEscape(): void
  openSourcePicker(): void
}
