import { computed } from 'vue'
import { defaultBookSettings } from './persistence'
import type { DecoderStoreState, DecoderStoreView } from './types'

export function createDecoderStoreView(state: DecoderStoreState): DecoderStoreView {
  const currentSettings = computed(() =>
    state.currentBookId.value
      ? state.bookSettings.value[state.currentBookId.value] || defaultBookSettings()
      : defaultBookSettings(),
  )

  return {
    currentSettings,
    isEnabled: computed(() => currentSettings.value.enabled),
    validEntitiesCount: computed(
      () => state.currentEntities.value.filter(entity => entity.bestMatch !== null).length,
    ),
    showCard: computed(
      () => state.selectedEntity.value !== null && state.cardPosition.value !== null,
    ),
  }
}
