import type {
  ReaderExperienceDecoderActions,
} from '@/composables/reader/experience-decoder-action-types'
import type {
  ReaderExperienceReadingActions,
} from '@/composables/reader/experience-reading-action-types'
import type {
  ReaderExperienceViewActions,
} from '@/composables/reader/experience-view-action-types'

export type ReaderExperienceToolbarActions =
  Pick<
    ReaderExperienceViewActions,
    | 'goBack'
    | 'openCatalog'
    | 'toggleFullscreen'
    | 'toggleDayNight'
    | 'openSettings'
    | 'toggleZenMode'
    | 'openSourcePicker'
    | 'openBookInfo'
    | 'openDecoderSettings'
  > &
  Pick<
    ReaderExperienceReadingActions,
    'handleRefresh' | 'handlePrevChapter' | 'handleNextChapter'
  > &
  Pick<ReaderExperienceDecoderActions, 'handleToggleDecoder'>
