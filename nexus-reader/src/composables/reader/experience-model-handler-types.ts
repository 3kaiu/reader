import type { ReaderExperienceActions } from './experience-action-types'

export type ReaderExperienceModelHandlerOptions = {
  goBack: () => void
  openCatalog: () => void
  toggleFullscreen: () => void
  toggleDayNight: () => void
  openSettings: () => void
  toggleZenMode: () => void
  openSourcePicker: () => void
  openBookInfo: () => void
  openDecoderSettings: () => void
  handleRefresh: () => void | Promise<void>
  handlePrevChapter: () => void | Promise<void>
  handleNextChapter: () => void | Promise<void>
  handleSelectChapter: (index: number) => void | Promise<void>
  handleToggleDecoder: (enabled: boolean) => void | Promise<void>
  decodeCurrentChapter: () => void | Promise<void>
  handleEntityClick: ReaderExperienceActions['handleEntityClick']
  handleConfirmEntity: ReaderExperienceActions['handleConfirmEntity']
  handleCorrectEntity: ReaderExperienceActions['handleCorrectEntity']
}
