import { computed } from 'vue'
import type { ReaderAssistState } from './experience-assist-types'
import type {
  ReaderExperienceServiceState,
} from './experience-state-service-types'
import type {
  ReaderExperienceVisibilityState,
} from './experience-state-visibility-types'

type ReaderExperienceAssistStateShape =
  ReaderExperienceServiceState &
  Pick<ReaderExperienceVisibilityState, 'showDecoderSettings'>

export function createReaderExperienceAssistState(
  state: ReaderExperienceAssistStateShape,
) {
  return computed<ReaderAssistState>(() => ({
    eyeCare: state.eyeCare,
    decoderStore: state.decoderStore,
    decoderAddonEnabled: state.decoderAddonEnabled,
    activeBookUrl: state.activeBookUrl,
    showDecoderSettings: state.showDecoderSettings,
  }))
}
