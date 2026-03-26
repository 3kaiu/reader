import { computed } from 'vue'
import type { ReaderScrollChapterProps } from './reader-scroll-chapter-prop-types'
import type {
  ReaderScrollChapterViewBindings,
} from './reader-scroll-chapter-view-binding-types'

export function createReaderScrollChapterViewBindings(
  props: ReaderScrollChapterProps,
): ReaderScrollChapterViewBindings {
  return {
    chapterIndex: computed(() => props.chapter.index),
    chapterOrder: computed(() => props.chapter.index + 1),
    chapterTitle: computed(() => props.chapter.title),
    hasFormattedContent: computed(() => Boolean(props.chapter.formattedContent)),
    renderedContent: computed(() =>
      props.highlightContent(props.chapter.formattedContent),
    ),
    onContentClick: (event: MouseEvent) => props.handleContentClick(event),
  }
}
