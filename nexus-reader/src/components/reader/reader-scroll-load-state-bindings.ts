import type { ReaderScrollLoadStateProps } from './reader-scroll-load-state-prop-types'
import { createReaderScrollLoadStateVisibilityBindings } from './reader-scroll-load-state-visibility-bindings'

export function createReaderScrollLoadStateBindings(props: ReaderScrollLoadStateProps) {
  return createReaderScrollLoadStateVisibilityBindings(props)
}
