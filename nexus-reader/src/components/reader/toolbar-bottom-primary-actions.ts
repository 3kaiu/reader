import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsBindings } from './toolbar-bottom-actions'
import { createReaderToolbarBottomReaderActions } from './toolbar-bottom-reader-actions'
import { createReaderToolbarBottomSourceActions } from './toolbar-bottom-source-actions'
import { createReaderToolbarBottomThemeActions } from './toolbar-bottom-theme-actions'

export function createReaderToolbarBottomPrimaryActions(
  props: ReaderToolbarBottomActionsBindings
): ReaderToolbarBottomAction[] {
  return [
    ...createReaderToolbarBottomThemeActions(props),
    ...createReaderToolbarBottomReaderActions(props),
    ...createReaderToolbarBottomSourceActions(props),
  ]
}
