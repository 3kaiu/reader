import { useReaderContentView } from '@/composables/useReaderContentView'
import type { ReaderContentProps } from './reader-content-prop-types'

export interface ReaderContentInteractionBindings {
  highlightContent: ReturnType<typeof useReaderContentView>['getHighlightedContent']
  handleContentClick: ReturnType<typeof useReaderContentView>['handleContentClick']
}

export function createReaderContentViewBindings(
  props: ReaderContentProps
): ReaderContentInteractionBindings {
  void props
  const { handleContentClick, getHighlightedContent } = useReaderContentView()

  return {
    handleContentClick,
    highlightContent: getHighlightedContent,
  }
}
