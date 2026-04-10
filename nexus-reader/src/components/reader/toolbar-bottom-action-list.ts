import { createReaderToolbarBottomStaticActions } from './toolbar-bottom-static-actions'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'

export function createReaderToolbarBottomActionList(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn
): ReaderToolbarBottomAction[] {
  const { primaryActions, trailingActions } = createReaderToolbarBottomStaticActions(props, emit)
  return [...primaryActions, ...trailingActions]
}
