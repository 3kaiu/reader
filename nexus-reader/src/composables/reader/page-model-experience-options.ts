import type {
  ReaderExperienceReadingActions,
} from './experience-reading-action-types'
import type {
  ReaderExperienceViewActions,
} from './experience-view-action-types'

export type ReaderPageExperienceActions =
  Pick<
    ReaderExperienceReadingActions,
    'handlePrevChapter' | 'handleNextChapter'
  > &
  Pick<
    ReaderExperienceViewActions,
    'toggleFullscreen' | 'toggleDayNight' | 'toggleZenMode'
  >

export type ReaderPageModelExperienceOptions = {
  readerExperienceActions: ReaderPageExperienceActions
}
