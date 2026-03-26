import type { DecodedEntity } from '@/types/decoder'
import type {
  createReaderContentViewportBindings,
} from './reader-content-viewport-bindings'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

export interface ReaderContentBindingOptions {
  onEntityClick: (entity: DecodedEntity, event: MouseEvent) => void
}

export interface ReaderContentInteractionBindings {
  highlightContent: ReaderScrollContentProps['highlightContent']
  handleContentClick: ReaderScrollContentProps['handleContentClick']
}

export interface ReaderContentBindingResult {
  viewportProps: ReturnType<typeof createReaderContentViewportBindings>
}
