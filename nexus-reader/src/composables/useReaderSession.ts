import { useRouter } from 'vue-router'
import { createReaderSessionInitializer } from '@/composables/reader/session-init'
import { setupReaderSessionLifecycle } from '@/composables/reader/session-lifecycle'
import { createReaderSessionRouteState } from '@/composables/reader/session-route'
import type { ReaderSessionOptions } from '@/composables/reader/session-types'

export function useReaderSession(options: ReaderSessionOptions) {
  const router = useRouter()
  const routeState = createReaderSessionRouteState(options)
  const initReader = createReaderSessionInitializer({
    options,
    router,
    routeTarget: routeState.routeTarget,
  })

  setupReaderSessionLifecycle({
    options,
    routeSessionKey: routeState.routeSessionKey,
    activeBookUrl: routeState.activeBookUrl,
    selectionContainerRef: routeState.selectionContainerRef,
    initReader,
  })

  return {
    contentRef: routeState.contentRef,
    routeTarget: routeState.routeTarget,
    routeBookUrl: routeState.routeBookUrl,
    routeSourceId: routeState.routeSourceId,
    activeBookUrl: routeState.activeBookUrl,
    selectionContainerRef: routeState.selectionContainerRef,
    initReader,
  }
}
