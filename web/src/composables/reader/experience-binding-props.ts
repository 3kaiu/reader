import type { ReaderExperienceBindingPropsResult } from './experience-binding-props-result-types'
import type { ReaderExperienceBindingState } from './experience-binding-state-types'
import { createReaderExperienceContentProps } from './experience-content'
import { createReaderExperienceModalProps } from './experience-modal'
import { createReaderExperienceToolbarProps } from './experience-toolbar'

export function createReaderExperienceBindingPropsResult(
  state: ReaderExperienceBindingState
): ReaderExperienceBindingPropsResult {
  return {
    toolbarProps: createReaderExperienceToolbarProps(state),
    contentProps: createReaderExperienceContentProps(state),
    modalProps: createReaderExperienceModalProps(state),
  }
}
