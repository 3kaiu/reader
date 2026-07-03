import { watch } from 'vue'
import type { ReaderSessionLifecycleContext } from './session-types'

export function setupReaderSessionRouteLifecycle(context: ReaderSessionLifecycleContext) {
  watch(
    context.routeSessionKey,
    () => {
      void context.initReader()
    },
    { immediate: true }
  )
}
