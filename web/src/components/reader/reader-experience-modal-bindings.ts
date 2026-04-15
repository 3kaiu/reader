import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderExperienceModalBindingActions } from './reader-experience-modal-action-types'
import { createReaderExperienceModalPropsBindings } from './reader-experience-modal-props-bindings'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderExperienceModalBindings(
  actions: ReaderExperienceModalBindingActions,
  modalProps: ComputedRef<ReaderModalsProps>
) {
  return computed(() => createReaderExperienceModalPropsBindings(modalProps.value, actions))
}
