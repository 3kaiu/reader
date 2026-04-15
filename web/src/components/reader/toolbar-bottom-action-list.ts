import { createReaderToolbarBottomStaticActions } from './toolbar-bottom-static-actions'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsBindings } from './toolbar-bottom-actions'

export function createReaderToolbarBottomActionList(
  props: ReaderToolbarBottomActionsBindings
): ReaderToolbarBottomAction[] {
  const { primaryActions, trailingActions } = createReaderToolbarBottomStaticActions(props)
  return [...primaryActions, ...trailingActions]
}
