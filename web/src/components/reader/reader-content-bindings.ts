import { createReaderContentScrollBindings } from './reader-content-scroll-bindings'
import { createReaderContentViewBindings } from './reader-content-view-bindings'
import { createReaderContentViewportBindings } from './reader-content-viewport-bindings'
import type { ReaderContentProps } from './reader-content-prop-types'

export interface ReaderContentBindingResult {
  viewportProps: ReturnType<typeof createReaderContentViewportBindings>
}

export function createReaderContentBindings(props: ReaderContentProps): ReaderContentBindingResult {
  const contentViewBindings = createReaderContentViewBindings(props)

  const scrollContentProps = createReaderContentScrollBindings(props, {
    highlightContent: contentViewBindings.highlightContent,
    handleContentClick: contentViewBindings.handleContentClick,
  })

  const viewportProps = createReaderContentViewportBindings(props, scrollContentProps)

  return {
    viewportProps,
  }
}
