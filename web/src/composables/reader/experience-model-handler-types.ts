import type { ReaderExperienceReadingActions } from './experience-reading-action-types'
import type { ReaderExperienceViewActions } from './experience-view-action-types'

export type ReaderExperienceModelHandlerOptions = {
  goBack: ReaderExperienceViewActions['goBack']
  openCatalog: ReaderExperienceViewActions['openCatalog']
  toggleFullscreen: ReaderExperienceViewActions['toggleFullscreen']
  toggleDayNight: ReaderExperienceViewActions['toggleDayNight']
  openSettings: ReaderExperienceViewActions['openSettings']
  toggleZenMode: ReaderExperienceViewActions['toggleZenMode']
  openSourcePicker: ReaderExperienceViewActions['openSourcePicker']
  openBookInfo: ReaderExperienceViewActions['openBookInfo']
  handleRefresh: ReaderExperienceReadingActions['handleRefresh']
  handlePrevChapter: ReaderExperienceReadingActions['handlePrevChapter']
  handleNextChapter: ReaderExperienceReadingActions['handleNextChapter']
  handleSelectChapter: ReaderExperienceReadingActions['handleSelectChapter']
}
