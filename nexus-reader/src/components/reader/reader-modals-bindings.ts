import {
  createReaderModalsPanelBindings,
} from './reader-modals-panel-bindings'
import type { ReaderModalsBindingResult } from './reader-modals-binding-types'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type {
  ReaderModalsPanelsProps,
} from './reader-modals-panels-prop-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderModalsBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn,
): ReaderModalsBindingResult {
  const panelProps: ReaderModalsPanelsProps = createReaderModalsPanelBindings(
    props,
    emit,
  )

  return {
    panelProps,
  }
}
