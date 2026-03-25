import { computed } from 'vue'
import type {
  ReaderAssistActions,
  ReaderAssistState,
} from '@/composables/reader/experience-assist-types'

export interface ReaderAssistLayersProps {
  state: ReaderAssistState
  actions: ReaderAssistActions
}

export function createReaderAssistLayersBindings(
  props: ReaderAssistLayersProps,
) {
  const showBreakReminder = computed(
    () => props.state.eyeCare.showBreakReminder.value,
  )

  const breakReminderBindings = computed(() => ({
    readingTime: props.state.eyeCare.formatReadingTime(),
    onDismiss: () => props.state.eyeCare.dismissBreakReminder(),
  }))

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

  const showDecoderSettings = computed(() => props.state.decoderAddonEnabled)

  const decoderSettingsBindings = computed(() => ({
    open: props.state.showDecoderSettings,
    bookUrl: props.state.activeBookUrl,
    'onUpdate:open': props.actions.setShowDecoderSettings,
  }))

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
    showBreakReminder,
    breakReminderBindings,
    showDecoderStatus,
    decoderStatusBindings,
    showDecoderSettings,
    decoderSettingsBindings,
    showDecoderCard,
    decoderCardBindings,
  }
}
