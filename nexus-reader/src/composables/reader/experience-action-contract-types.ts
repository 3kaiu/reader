import type { ReaderExperienceModalActions } from './experience-modal-action-types'
import type { ReaderExperienceReadingActions } from './experience-reading-action-types'
import type { ReaderExperienceViewActions } from './experience-view-action-types'

export type ReaderExperienceActions = ReaderExperienceViewActions &
  ReaderExperienceReadingActions &
  ReaderExperienceModalActions
