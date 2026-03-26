import type {
  ReaderExperienceDecoderActions,
} from './experience-decoder-action-types'
import type {
  ReaderExperienceReadingActions,
} from './experience-reading-action-types'
import type {
  ReaderExperienceViewActions,
} from './experience-view-action-types'

export type ReaderExperienceModelHandlerOptions = {
  goBack: ReaderExperienceViewActions['goBack']
  openCatalog: ReaderExperienceViewActions['openCatalog']
  toggleFullscreen: ReaderExperienceViewActions['toggleFullscreen']
  toggleDayNight: ReaderExperienceViewActions['toggleDayNight']
  openSettings: ReaderExperienceViewActions['openSettings']
  toggleZenMode: ReaderExperienceViewActions['toggleZenMode']
  openSourcePicker: ReaderExperienceViewActions['openSourcePicker']
  openBookInfo: ReaderExperienceViewActions['openBookInfo']
  openDecoderSettings: ReaderExperienceViewActions['openDecoderSettings']
  handleRefresh: ReaderExperienceReadingActions['handleRefresh']
  handlePrevChapter: ReaderExperienceReadingActions['handlePrevChapter']
  handleNextChapter: ReaderExperienceReadingActions['handleNextChapter']
  handleSelectChapter: ReaderExperienceReadingActions['handleSelectChapter']
  handleToggleDecoder: ReaderExperienceDecoderActions['handleToggleDecoder']
  decodeCurrentChapter: ReaderExperienceDecoderActions['decodeCurrentChapter']
  handleEntityClick: ReaderExperienceDecoderActions['handleEntityClick']
  handleConfirmEntity: ReaderExperienceDecoderActions['handleConfirmEntity']
  handleCorrectEntity: ReaderExperienceDecoderActions['handleCorrectEntity']
}
