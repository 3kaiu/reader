import { computed } from 'vue'
import { buildSourceGroups } from '@/stores/source/helpers'
import type { SourceStoreState, SourceStoreView } from './types'

export function createSourceStoreView(state: SourceStoreState): SourceStoreView {
  return {
    enabledCount: computed(
      () => state.sources.value.filter(source => source.enabled !== false).length
    ),
    unhealthyCount: computed(
      () =>
        state.sources.value.filter(source => {
          const health = source.health
          if (!health) {
            return false
          }

          return (
            health.circuitState === 'open' ||
            (health.healthPoints ?? 100) < 60 ||
            (health.consecutiveFailures ?? 0) >= 3
          )
        }).length
    ),
    openCircuitCount: computed(
      () => state.sources.value.filter(source => source.health?.circuitState === 'open').length
    ),
    groups: computed(() => buildSourceGroups(state.sources.value)),
  }
}
