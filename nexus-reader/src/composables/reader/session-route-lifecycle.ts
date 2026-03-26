import { watch } from 'vue'
import type {
  ReaderSessionLifecycleContext,
} from './session-lifecycle-context-types'

export function setupReaderSessionRouteLifecycle(
  context: ReaderSessionLifecycleContext,
) {
  watch(
    context.routeSessionKey,
    () => {
      void context.initReader()
    },
    { immediate: true },
  )
}
