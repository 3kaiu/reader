import { computed } from 'vue'
import type { DecodedEntity } from '@/types/decoder'
import { applyDecoderHighlight } from '@/utils/readerContent'

export function useReaderContentView(options: {
  decoderEnabled?: boolean
  decoderEntities?: DecodedEntity[]
  onEntityClick: (entity: DecodedEntity, event: MouseEvent) => void
}) {
  const entityMap = computed(() => {
    const entities = options.decoderEntities || []
    return new Map(entities.map(entity => [entity.id, entity]))
  })

  function handleContentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (!target?.classList.contains('decoder-entity')) {
      return
    }

    const entityId = target.dataset.entityId
    if (!entityId) {
      return
    }

    const entity = entityMap.value.get(entityId)
    if (entity) {
      options.onEntityClick(entity, event)
    }
  }

  function getHighlightedContent(content: string | undefined): string {
    if (!content) {
      return ''
    }

    if (!options.decoderEnabled || !options.decoderEntities?.length) {
      return content
    }

    return applyDecoderHighlight(content, options.decoderEntities)
  }

  return {
    handleContentClick,
    getHighlightedContent,
  }
}
