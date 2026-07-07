import type {
  ReaderExperienceBindingProps,
  ReaderExperienceBindingResult,
  ReaderExperienceBindingPropsResult,
  ReaderExperienceBindingAssistResult,
  ReaderExperienceBindingState,
} from './experience-types'
import { createReaderEyeCareToggleHandler } from './experience-eye-care-toggle'
import { createReaderExperienceContentProps } from './experience-content'
import { createReaderExperienceModalProps } from './experience-modal'
import { createReaderExperienceToolbarProps } from './experience-toolbar'

function createReaderExperienceBindingPropsResult(
  state: ReaderExperienceBindingState
): ReaderExperienceBindingPropsResult {
  return {
    toolbarProps: createReaderExperienceToolbarProps(state),
    contentProps: createReaderExperienceContentProps(state),
    modalProps: createReaderExperienceModalProps(state),
  }
}

function createReaderExperienceBindingAssistResult(
  props: ReaderExperienceBindingProps
): ReaderExperienceBindingAssistResult {
  return {
    handleToggleEyeCare: createReaderEyeCareToggleHandler(props.state),
  }
}

export type { ReaderExperienceBindingProps } from './experience-types'
export type { ReaderExperienceBindingResult } from './experience-types'

export function createReaderExperienceBindings(
  props: ReaderExperienceBindingProps
): ReaderExperienceBindingResult {
  return {
    ...createReaderExperienceBindingPropsResult(props.state),
    ...createReaderExperienceBindingAssistResult(props),
  }
}