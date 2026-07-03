import type { ReaderExperienceModalActions } from '@/composables/reader/experience-types'
import type { ReaderExperienceReadingActions } from '@/composables/reader/experience-types'

export type ReaderExperienceModalBindingActions = Pick<
  ReaderExperienceModalActions,
  | 'setShowCatalog'
  | 'setShowSettings'
  | 'setShowSourcePicker'
  | 'setShowBookInfo'
  | 'setShowKeyboardHelp'
> &
  Pick<ReaderExperienceReadingActions, 'handleSelectChapter' | 'handleRefresh'>
