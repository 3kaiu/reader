import { computed } from 'vue'
import type { ReaderScrollChapterProps } from './reader-scroll-chapter-prop-types'
import type { ReaderScrollChapterViewBindings } from './reader-scroll-chapter-view-binding-types'

export function createReaderScrollChapterViewBindings(
  props: ReaderScrollChapterProps
): ReaderScrollChapterViewBindings {
  const chapterContainerStyle = computed(() => {
    const contentLength = props.chapter.formattedContent?.length || 0
    const estimatedLines = Math.max(Math.ceil(contentLength / 34), 20)
    const estimatedHeight = 220 + estimatedLines * 30
    return {
      '--chapter-intrinsic-size': `${estimatedHeight}px`,
    }
  })

  return {
    chapterIndex: computed(() => props.chapter.index),
    chapterOrder: computed(() => props.chapter.index + 1),
    chapterTitle: computed(() => props.chapter.title),
    chapterContainerStyle,
    hasFormattedContent: computed(() => Boolean(props.chapter.formattedContent)),
    renderedContent: computed(() => props.highlightContent(props.chapter.formattedContent)),
    onContentClick: (event: MouseEvent) => props.handleContentClick(event),
  }
}
