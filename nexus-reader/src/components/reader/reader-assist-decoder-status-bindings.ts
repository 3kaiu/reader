import { computed } from 'vue'
import type { ReaderAssistLayersProps } from './reader-assist-layers-prop-types'

export function createReaderAssistDecoderStatusBindings(
  props: ReaderAssistLayersProps,
) {
  const showDecoderStatus = computed(
    () => props.state.decoderAddonEnabled && props.state.decoderStore.isEnabled,
  )

  const decoderStatusBindings = computed(() => ({
    isDecoding: props.state.decoderStore.isDecoding,
    error: props.state.decoderStore.decodeError,
    entitiesCount: props.state.decoderStore.validEntitiesCount,
    hasDecoded:
      props.state.decoderStore.currentEntities.length > 0 ||
      props.state.decoderStore.decodeError !== null,
    onRetry: props.actions.decodeCurrentChapter,
  }))

  return {
    showDecoderStatus,
    decoderStatusBindings,
  }
}
