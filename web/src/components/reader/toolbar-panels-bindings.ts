import type { ComputedRef } from 'vue'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'
import {
  createReaderToolbarPanelsBottomBarBindings,
  type ReaderToolbarPanelsBottomBarBindings,
} from './toolbar-panels-bottom-bar-bindings'
import {
  createReaderToolbarPanelsTopBarBindings,
  type ReaderToolbarPanelsTopBarBindings,
} from './toolbar-panels-top-bar-bindings'

export interface ReaderToolbarPanelsBindingResult {
  topBarBindings: ComputedRef<ReaderToolbarPanelsTopBarBindings>
  bottomBarBindings: ComputedRef<ReaderToolbarPanelsBottomBarBindings>
}

export function createReaderToolbarPanelsBindings(
  props: ReaderToolbarPanelsProps
): ReaderToolbarPanelsBindingResult {
  return {
    topBarBindings: createReaderToolbarPanelsTopBarBindings(props),
    bottomBarBindings: createReaderToolbarPanelsBottomBarBindings(props),
  }
}
