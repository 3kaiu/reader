import type { DecodedEntity } from '@/types/decoder'

export interface ReaderExperienceActions {
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
  handleRefresh(): void | Promise<void>
  handlePrevChapter(): void | Promise<void>
  handleNextChapter(): void | Promise<void>
  handleSelectChapter(index: number): void | Promise<void>
  handleToggleDecoder(enabled: boolean): void | Promise<void>
  decodeCurrentChapter(): void | Promise<void>
  handleEntityClick(entity: DecodedEntity, event: MouseEvent): void
  handleConfirmEntity(entity: DecodedEntity): void | Promise<void>
  handleCorrectEntity(
    entity: DecodedEntity,
    newReal: string,
  ): void | Promise<void>
  setShowCatalog(value: boolean): void
  setShowSettings(value: boolean): void
  setShowSourcePicker(value: boolean): void
  setShowBookInfo(value: boolean): void
  setShowKeyboardHelp(value: boolean): void
  setShowDecoderSettings(value: boolean): void
}
