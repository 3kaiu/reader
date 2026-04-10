import { computed } from 'vue'
import type { ReaderScrollChapterListProps } from './reader-scroll-chapter-list-prop-types'
import type { ReaderScrollChapterListViewBindings } from './reader-scroll-chapter-list-binding-types'
import type { ReaderScrollChapterProps } from './reader-scroll-chapter-prop-types'

export function createReaderScrollChapterListBindings(
  props: ReaderScrollChapterListProps
): ReaderScrollChapterListViewBindings {
  return {
    chapterItemPropsList: computed<ReaderScrollChapterProps[]>(() =>
      props.loadedChapters.map(chapter => ({
        chapter,
        highlightContent: props.highlightContent,
        handleContentClick: props.handleContentClick,
      }))
    ),
  }
}
