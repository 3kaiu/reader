import { useReaderContentView } from '@/composables/useReaderContentView'
import type {
  ReaderContentBindingOptions,
  ReaderContentInteractionBindings,
} from './reader-content-binding-types'
import type { ReaderContentProps } from './reader-content-prop-types'

export function createReaderContentViewBindings(
  props: ReaderContentProps,
  options: ReaderContentBindingOptions,
): ReaderContentInteractionBindings {
  const { handleContentClick, getHighlightedContent } = useReaderContentView({
    decoderEnabled: props.decoderEnabled,
    decoderEntities: props.decoderEntities,
    onEntityClick: options.onEntityClick,
  })

  return {
    handleContentClick,
    highlightContent: getHighlightedContent,
  }
}
