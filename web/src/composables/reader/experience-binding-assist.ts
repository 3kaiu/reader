import { createReaderEyeCareToggleHandler } from './experience-assist'
import type { ReaderExperienceBindingProps } from './experience-binding-prop-types'
import type { ReaderExperienceBindingAssistResult } from './experience-binding-assist-result-types'

export function createReaderExperienceBindingAssistResult(
  props: ReaderExperienceBindingProps
): ReaderExperienceBindingAssistResult {
  return {
    handleToggleEyeCare: createReaderEyeCareToggleHandler(props.state),
  }
}
