import type { ReaderExperienceBindingPropsResult } from './experience-types'
import type { ReaderExperienceBindingState } from './experience-types'
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
