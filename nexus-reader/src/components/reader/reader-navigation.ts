import { computed } from 'vue'

export interface ReaderNavigationProps {
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
}

export type ReaderNavigationEmits = {
  prev: []
  next: []
}

export function createReaderNavigationBindings(
  props: ReaderNavigationProps,
) {
  const progressText = computed(
    () => `${props.currentChapterIndex + 1} / ${props.totalChapters}`,
  )

  const progressPercent = computed(
    () =>
      Math.round(
        ((props.currentChapterIndex + 1) / (props.totalChapters || 1)) * 100,
      ),
  )

  return {
    progressText,
    progressPercent,
  }
}
