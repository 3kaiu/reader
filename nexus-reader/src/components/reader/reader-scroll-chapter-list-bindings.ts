import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderScrollChapterListProps } from './reader-scroll-chapter-list-prop-types'
import type { ReaderScrollChapterProps } from './reader-scroll-chapter-prop-types'

export interface ReaderScrollChapterListViewBindings {
  chapterItemPropsList: ComputedRef<ReaderScrollChapterProps[]>
}

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
