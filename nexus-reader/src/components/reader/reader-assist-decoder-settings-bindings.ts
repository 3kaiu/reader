import { computed } from 'vue'
import type { ReaderAssistLayersProps } from './reader-assist-layers-prop-types'

export function createReaderAssistDecoderSettingsBindings(
  props: ReaderAssistLayersProps,
) {
  const showDecoderSettings = computed(() => props.state.decoderAddonEnabled)

  const decoderSettingsBindings = computed(() => ({
    open: props.state.showDecoderSettings,
    bookUrl: props.state.activeBookUrl,
    'onUpdate:open': props.actions.setShowDecoderSettings,
  }))

  return {
    showDecoderSettings,
    decoderSettingsBindings,
  }
}
