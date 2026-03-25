import { computed } from 'vue'
import type {
  ReaderAssistActions,
  ReaderAssistState,
} from './experience-assist-types'
import type { ReaderExperienceActions } from './experience-action-types'
import type { ReaderExperienceState } from './experience-state-types'

export function createReaderExperienceAssistState(
  state: ReaderExperienceState,
) {
  return computed<ReaderAssistState>(() => ({
    eyeCare: state.eyeCare,
    decoderStore: state.decoderStore,
    decoderAddonEnabled: state.decoderAddonEnabled,
    activeBookUrl: state.activeBookUrl,
    showDecoderSettings: state.showDecoderSettings,
  }))
}

export function createReaderExperienceAssistActions(
  actions: ReaderExperienceActions,
): ReaderAssistActions {
  return {
    setShowDecoderSettings: actions.setShowDecoderSettings,
    decodeCurrentChapter: actions.decodeCurrentChapter,
    handleConfirmEntity: actions.handleConfirmEntity,
    handleCorrectEntity: actions.handleCorrectEntity,
  }
}

export function createReaderEyeCareToggleHandler(
  state: ReaderExperienceState,
) {
  return function handleToggleEyeCare() {
    if (state.eyeCare.config.value.enabled) {
      state.eyeCare.disable()
      return
    }

    state.eyeCare.enable()
  }
}
