import { computed } from 'vue'
import type {
  ReaderContentStyle,
  ReaderLoadedChapter,
} from './content-types'

export interface ReaderScrollContentProps {
  contentStyle: ReaderContentStyle
  loadedChapters: ReaderLoadedChapter[]
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  paragraphSpacing: number
  loadError?: string | null
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}

export type ReaderScrollContentEmits = {
  loadNextChapter: []
  retryLoad: []
}

export function createReaderScrollContentBindings(
  props: ReaderScrollContentProps,
) {
  const contentContainerStyle = computed(() => ({
    ...props.contentStyle,
    '--p-spacing': `${props.paragraphSpacing}em`,
    '--p-line-height': props.contentStyle.lineHeight,
  }))

  return {
    contentContainerStyle,
  }
}
