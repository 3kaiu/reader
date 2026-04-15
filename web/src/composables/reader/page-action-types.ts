export interface ReaderPageActions {
  toggleToolbar(): void
  handlePrevChapter(): void | Promise<void>
  handleNextChapter(): void | Promise<void>
  retryCurrentChapter(): void | Promise<void>
  toggleFullscreen(): void
  toggleCatalog(): void
  toggleSettings(): void
  toggleDayNight(): void
  toggleZenMode(): void
  toggleKeyboardHelp(): void
  handleEscape(): void
  openSourcePicker(): void
}
