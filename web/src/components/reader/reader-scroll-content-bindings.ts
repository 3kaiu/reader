import { createReaderScrollChapterListBindings } from './reader-scroll-content-chapter-bindings'
import { createReaderScrollContentLoadStateBindings } from './reader-scroll-content-load-state-bindings'
import { createReaderScrollContentStyleBindings } from './reader-scroll-content-style-bindings'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

export function createReaderScrollContentBindings(props: ReaderScrollContentProps) {
  const contentContainerStyle = createReaderScrollContentStyleBindings(props)
  const chapterListProps = createReaderScrollChapterListBindings(props)
  const loadStateProps = createReaderScrollContentLoadStateBindings(props)

  return {
    contentContainerStyle,
    chapterListProps,
    loadStateProps,
  }
}
