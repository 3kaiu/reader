import type {
  ReaderExperienceDisplayState,
} from './experience-state-display-types'
import type {
  ReaderExperienceServiceState,
} from './experience-state-service-types'
import type {
  ReaderExperienceVisibilityState,
} from './experience-state-visibility-types'

export type ReaderExperienceBindingState =
  ReaderExperienceServiceState &
  ReaderExperienceVisibilityState &
  ReaderExperienceDisplayState
