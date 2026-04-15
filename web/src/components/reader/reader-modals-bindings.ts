import { createReaderModalsPanelBindings } from './reader-modals-panel-bindings'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type { ReaderModalsPanelBindings } from './reader-modals-panel-binding-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export interface ReaderModalsBindingResult {
  panelsProps: ReaderModalsPanelBindings
}

export function createReaderModalsBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn
): ReaderModalsBindingResult {
  const panelsProps: ReaderModalsPanelBindings = createReaderModalsPanelBindings(props, emit)

  return {
    panelsProps,
  }
}
