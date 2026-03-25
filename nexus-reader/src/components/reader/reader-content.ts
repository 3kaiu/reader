import { computed, toRef } from 'vue'
import { useReaderContentView } from '@/composables/useReaderContentView'
import type { DecodedEntity } from '@/types/decoder'
import type {
  ReaderContentStyle,
  ReaderLoadedChapter,
} from './content-types'

export interface ReaderContentProps {
  contentStyle: ReaderContentStyle
  loadedChapters: ReaderLoadedChapter[]
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  isFullscreen: boolean
  formattedTime: string
  paragraphSpacing: number
  loadError?: string | null
  decoderEnabled?: boolean
  decoderEntities?: DecodedEntity[]
}

export type ReaderContentEmits = {
  click: []
  loadNextChapter: []
  retryLoad: []
  entityClick: [entity: DecodedEntity, event: MouseEvent]
}

export function createReaderContentBindings(
  props: ReaderContentProps,
  options: {
    onEntityClick: (entity: DecodedEntity, event: MouseEvent) => void
  },
) {
  const { handleContentClick, getHighlightedContent } = useReaderContentView({
    decoderEnabled: props.decoderEnabled,
    decoderEntities: props.decoderEntities,
    onEntityClick: options.onEntityClick,
  })

  const scrollContentProps = computed(() => ({
    contentStyle: props.contentStyle,
    loadedChapters: props.loadedChapters,
    isParsing: props.isParsing,
    isLoadingMore: props.isLoadingMore,
    hasNextChapter: props.hasNextChapter,
    paragraphSpacing: props.paragraphSpacing,
    loadError: props.loadError,
    highlightContent: getHighlightedContent,
    handleContentClick,
  }))

  return {
    scrollContentProps,
    formattedTime: toRef(props, 'formattedTime'),
    isFullscreen: toRef(props, 'isFullscreen'),
  }
}
