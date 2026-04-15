import { createReaderExperienceBindingAssistResult } from './experience-binding-assist'
import type { ReaderExperienceBindingProps } from './experience-binding-prop-types'
import type { ReaderExperienceBindingResult } from './experience-binding-result-types'
import { createReaderExperienceBindingPropsResult } from './experience-binding-props'

export type { ReaderExperienceBindingProps } from './experience-binding-prop-types'
export type { ReaderExperienceBindingResult } from './experience-binding-result-types'

export function createReaderExperienceBindings(
  props: ReaderExperienceBindingProps
): ReaderExperienceBindingResult {
  return {
    ...createReaderExperienceBindingPropsResult(props.state),
    ...createReaderExperienceBindingAssistResult(props),
  }
}
