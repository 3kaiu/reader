import { computed } from 'vue'
import type {
  ReaderScrollChapterListProps,
} from './reader-scroll-chapter-list-prop-types'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

export function createReaderScrollChapterListBindings(
  props: Pick<
    ReaderScrollContentProps,
    'loadedChapters' | 'highlightContent' | 'handleContentClick'
  >,
) {
  return computed<ReaderScrollChapterListProps>(() => ({
    loadedChapters: props.loadedChapters,
    highlightContent: props.highlightContent,
    handleContentClick: props.handleContentClick,
  }))
}
