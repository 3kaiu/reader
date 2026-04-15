import type { ReaderExperienceModalActions } from '@/composables/reader/experience-modal-action-types'
import type { ReaderExperienceReadingActions } from '@/composables/reader/experience-reading-action-types'

export type ReaderExperienceModalBindingActions = Pick<
  ReaderExperienceModalActions,
  | 'setShowCatalog'
  | 'setShowSettings'
  | 'setShowSourcePicker'
  | 'setShowBookInfo'
  | 'setShowKeyboardHelp'
> &
  Pick<ReaderExperienceReadingActions, 'handleSelectChapter' | 'handleRefresh'>
