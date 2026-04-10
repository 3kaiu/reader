import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'
import { createReaderToolbarBottomReaderActions } from './toolbar-bottom-reader-actions'
import { createReaderToolbarBottomSourceActions } from './toolbar-bottom-source-actions'
import { createReaderToolbarBottomThemeActions } from './toolbar-bottom-theme-actions'

export function createReaderToolbarBottomPrimaryActions(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn
): ReaderToolbarBottomAction[] {
  return [
    ...createReaderToolbarBottomThemeActions(props, emit),
    ...createReaderToolbarBottomReaderActions(emit),
    ...createReaderToolbarBottomSourceActions(props, emit),
  ]
}
