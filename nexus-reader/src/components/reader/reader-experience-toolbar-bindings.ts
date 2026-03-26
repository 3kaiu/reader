import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  ReaderExperienceToolbarActions,
} from './reader-experience-toolbar-action-types'
import {
  createReaderExperienceToolbarPropsBindings,
} from './reader-experience-toolbar-props-bindings'
import type { ReaderToolbarProps } from './toolbar-prop-types'

export function createReaderExperienceToolbarBindings(
  actions: ReaderExperienceToolbarActions,
  toolbarProps: ComputedRef<ReaderToolbarProps>,
  handleToggleEyeCare: () => void,
) {
  return computed(() =>
    createReaderExperienceToolbarPropsBindings(
      toolbarProps.value,
      actions,
      handleToggleEyeCare,
    ),
  )
}
