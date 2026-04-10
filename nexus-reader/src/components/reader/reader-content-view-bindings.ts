import { useReaderContentView } from '@/composables/useReaderContentView'
import type { ReaderContentInteractionBindings } from './reader-content-binding-types'
import type { ReaderContentProps } from './reader-content-prop-types'

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
