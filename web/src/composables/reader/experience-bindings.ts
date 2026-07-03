import { createReaderExperienceBindingAssistResult } from './experience-binding-assist'
import type { ReaderExperienceBindingProps } from './experience-types'
import type { ReaderExperienceBindingResult } from './experience-types'
import { createReaderExperienceBindingPropsResult } from './experience-binding-props'

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
