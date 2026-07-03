import { createReaderEyeCareToggleHandler } from './experience-assist'
import type { ReaderExperienceBindingProps } from './experience-types'
import type { ReaderExperienceBindingAssistResult } from './experience-types'

export function createReaderExperienceBindingAssistResult(
  props: ReaderExperienceBindingProps
): ReaderExperienceBindingAssistResult {
  return {
    handleToggleEyeCare: createReaderEyeCareToggleHandler(props.state),
  }
}
