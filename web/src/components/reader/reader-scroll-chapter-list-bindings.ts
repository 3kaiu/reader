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
  const chapterPropsCache = new Map<number, ReaderScrollChapterProps>()

  return {
    chapterItemPropsList: computed<ReaderScrollChapterProps[]>(() => {
      const nextList: ReaderScrollChapterProps[] = []
      const activeChapterIndexes = new Set<number>()

      for (const chapter of props.loadedChapters) {
        activeChapterIndexes.add(chapter.index)
        const cached = chapterPropsCache.get(chapter.index)
        if (
          cached &&
          cached.chapter === chapter &&
          cached.highlightContent === props.highlightContent &&
          cached.handleContentClick === props.handleContentClick
        ) {
          nextList.push(cached)
          continue
        }

        const nextProps: ReaderScrollChapterProps = {
          chapter,
          highlightContent: props.highlightContent,
          handleContentClick: props.handleContentClick,
        }
        chapterPropsCache.set(chapter.index, nextProps)
        nextList.push(nextProps)
      }

      for (const chapterIndex of chapterPropsCache.keys()) {
        if (!activeChapterIndexes.has(chapterIndex)) {
          chapterPropsCache.delete(chapterIndex)
        }
      }

      return nextList
    }),
  }
}
