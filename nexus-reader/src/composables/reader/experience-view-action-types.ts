export interface ReaderExperienceViewActions {
  bindContentRef(instance: unknown): void
  goBack(): void
  openCatalog(): void
  toggleFullscreen(): void
  toggleDayNight(): void
  openSettings(): void
  toggleZenMode(): void
  openSourcePicker(): void
  openBookInfo(): void
  openDecoderSettings(): void
}
