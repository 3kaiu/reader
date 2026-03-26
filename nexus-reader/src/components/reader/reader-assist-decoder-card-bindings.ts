import { computed } from 'vue'
import type { ReaderAssistLayersProps } from './reader-assist-layers-prop-types'

export function createReaderAssistDecoderCardBindings(
  props: ReaderAssistLayersProps,
) {
  const showDecoderCard = computed(
    () =>
      props.state.decoderAddonEnabled &&
      props.state.decoderStore.selectedEntity !== null,
  )

  const decoderCardBindings = computed(() => ({
    entity: props.state.decoderStore.selectedEntity!,
    position: props.state.decoderStore.cardPosition,
    visible: props.state.decoderStore.showCard,
    onClose: () => props.state.decoderStore.closeCard(),
    onConfirm: props.actions.handleConfirmEntity,
    onCorrect: props.actions.handleCorrectEntity,
  }))

  return {
    showDecoderCard,
    decoderCardBindings,
  }
}
