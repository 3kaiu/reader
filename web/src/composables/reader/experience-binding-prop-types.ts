import type { ReaderExperienceBindingActions } from './experience-binding-action-types'
import type { ReaderExperienceBindingState } from './experience-binding-state-types'

export interface ReaderExperienceBindingProps {
  state: ReaderExperienceBindingState
  actions: ReaderExperienceBindingActions
}
