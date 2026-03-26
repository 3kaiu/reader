import type { ComputedRef } from 'vue'
import type { ReaderScrollChapterProps } from './reader-scroll-chapter-prop-types'

export interface ReaderScrollChapterListViewBindings {
  chapterItemPropsList: ComputedRef<ReaderScrollChapterProps[]>
}
