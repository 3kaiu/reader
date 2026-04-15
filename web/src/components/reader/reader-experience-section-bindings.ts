import type { ReaderExperienceBindingResult } from '@/composables/reader/experience-binding-result-types'
import type { ReaderExperienceBindingProps } from '@/composables/reader/experience-binding-prop-types'
import { createReaderExperienceContentBindings } from './reader-experience-content-bindings'
import type { ReaderExperienceLayoutBindings } from './reader-experience-layout-binding-types'
import { createReaderExperienceModalBindings } from './reader-experience-modal-bindings'
import { createReaderExperienceToolbarBindings } from './reader-experience-toolbar-bindings'

export function createReaderExperienceSectionBindings(
  props: ReaderExperienceBindingProps,
  bindings: ReaderExperienceBindingResult
): ReaderExperienceLayoutBindings {
  return {
    toolbarBindings: createReaderExperienceToolbarBindings(
      props.actions,
      bindings.toolbarProps,
      bindings.handleToggleEyeCare
    ),
    contentBindings: createReaderExperienceContentBindings(
      props.state,
      props.actions,
      bindings.contentProps
    ),
    modalBindings: createReaderExperienceModalBindings(props.actions, bindings.modalProps),
  }
}
