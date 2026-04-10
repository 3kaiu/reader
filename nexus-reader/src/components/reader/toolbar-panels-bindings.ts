import type { ReaderToolbarPanelsBindingResult } from './toolbar-panels-binding-types'
import type { ReaderToolbarPanelsEmitFn } from './toolbar-panels-emit-types'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'
import { createReaderToolbarPanelsBottomBarBindings } from './toolbar-panels-bottom-bar-bindings'
import { createReaderToolbarPanelsTopBarBindings } from './toolbar-panels-top-bar-bindings'

export function createReaderToolbarPanelsBindings(
  props: ReaderToolbarPanelsProps,
  emit: ReaderToolbarPanelsEmitFn
): ReaderToolbarPanelsBindingResult {
  return {
    topBarBindings: createReaderToolbarPanelsTopBarBindings(props, emit),
    bottomBarBindings: createReaderToolbarPanelsBottomBarBindings(props, emit),
  }
}
