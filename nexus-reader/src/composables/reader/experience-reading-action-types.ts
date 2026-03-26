export interface ReaderExperienceReadingActions {
  handleRefresh(): void | Promise<void>
  handlePrevChapter(): void | Promise<void>
  handleNextChapter(): void | Promise<void>
  handleSelectChapter(index: number): void | Promise<void>
}
