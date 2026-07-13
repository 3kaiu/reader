import type { ReaderToolbarBottomActionsBindings } from './toolbar-bottom-actions'
import { createReaderToolbarBottomPrimaryActions } from './toolbar-bottom-primary-actions'
import { createReaderToolbarBottomTrailingActions } from './toolbar-bottom-trailing-actions'

export function createReaderToolbarBottomStaticActions(props: ReaderToolbarBottomActionsBindings) {
  const primaryActions = createReaderToolbarBottomPrimaryActions(props)
  const trailingActions = createReaderToolbarBottomTrailingActions(props)

  return {
    primaryActions,
    trailingActions,
  }
}
