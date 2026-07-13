import { computed } from 'vue'

export interface ReaderNavigationProgressProps {
  progressText: string
  progressPercent: number
}

export function createReaderNavigationProgressViewBindings(props: ReaderNavigationProgressProps) {
  return {
    chapterProgressText: computed(() => props.progressText),
    progressPercentText: computed(() => `${props.progressPercent}%`),
  }
}
