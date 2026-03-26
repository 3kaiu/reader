import {
  createReaderExperienceAssistActions,
  createReaderExperienceAssistState,
  createReaderEyeCareToggleHandler,
} from './experience-assist'
import type {
  ReaderExperienceBindingProps,
} from './experience-binding-prop-types'
import type {
  ReaderExperienceBindingAssistResult,
} from './experience-binding-assist-result-types'

export function createReaderExperienceBindingAssistResult(
  props: ReaderExperienceBindingProps,
): ReaderExperienceBindingAssistResult {
  return {
    assistState: createReaderExperienceAssistState(props.state),
    assistActions: createReaderExperienceAssistActions(props.actions),
    handleToggleEyeCare: createReaderEyeCareToggleHandler(props.state),
  }
}
