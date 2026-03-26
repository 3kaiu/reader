import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'
import { createReaderToolbarBottomPrimaryActions } from './toolbar-bottom-primary-actions'
import { createReaderToolbarBottomTrailingActions } from './toolbar-bottom-trailing-actions'

export function createReaderToolbarBottomStaticActions(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn,
) {
  const primaryActions = createReaderToolbarBottomPrimaryActions(props, emit)
  const trailingActions = createReaderToolbarBottomTrailingActions(emit)

  return {
    primaryActions,
    trailingActions,
  }
}
