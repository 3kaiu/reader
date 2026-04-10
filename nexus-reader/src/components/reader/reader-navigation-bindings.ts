import type { ReaderNavigationBindingResult } from './reader-navigation-binding-types'
import { createReaderNavigationContentBindings } from './reader-navigation-content-bindings'
import { createReaderNavigationProgressBindings } from './reader-navigation-progress-bindings'
import type { ReaderNavigationProps } from './reader-navigation-types'

export function createReaderNavigationBindings(
  props: ReaderNavigationProps
): ReaderNavigationBindingResult {
  const progressBindings = createReaderNavigationProgressBindings(props)

  return {
    contentProps: createReaderNavigationContentBindings(props, progressBindings),
  }
}
