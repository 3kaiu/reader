import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  ReaderAssistActions,
  ReaderAssistState,
} from '@/composables/reader/experience-assist-types'
import type { ReaderAssistLayersProps } from './reader-assist-layers-prop-types'

export function createReaderExperienceAssistBindings(
  assistState: ComputedRef<ReaderAssistState>,
  assistActions: ReaderAssistActions,
) {
  return computed<ReaderAssistLayersProps>(() => ({
    state: assistState.value,
    actions: assistActions,
  }))
}
