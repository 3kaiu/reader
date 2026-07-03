import type { ReaderExperienceReadingActions } from '@/composables/reader/experience-types'
import type { ReaderExperienceViewActions } from '@/composables/reader/experience-types'

export type ReaderExperienceToolbarActions = Pick<
  ReaderExperienceViewActions,
  | 'goBack'
  | 'openCatalog'
  | 'toggleFullscreen'
  | 'toggleDayNight'
  | 'openSettings'
  | 'toggleZenMode'
  | 'openSourcePicker'
  | 'openBookInfo'
> &
  Pick<ReaderExperienceReadingActions, 'handleRefresh' | 'handlePrevChapter' | 'handleNextChapter'>
