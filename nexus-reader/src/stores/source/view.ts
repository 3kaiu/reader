import { computed } from 'vue'
import { buildSourceGroups } from '@/utils/sourceStore'
import type { SourceStoreState, SourceStoreView } from './types'

export function createSourceStoreView(state: SourceStoreState): SourceStoreView {
  return {
    enabledCount: computed(
      () => state.sources.value.filter(source => source.enabled !== false).length
    ),
    groups: computed(() => buildSourceGroups(state.sources.value)),
  }
}
