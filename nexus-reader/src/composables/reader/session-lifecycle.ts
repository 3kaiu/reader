import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  watch,
} from 'vue'
import { useEngagementTracker } from '@/composables/useEngagementTracker'
import type { ReaderSessionLifecycleContext } from './session-types'

export function setupReaderSessionLifecycle(
  context: ReaderSessionLifecycleContext,
) {
  const { startTracking, stopTracking } = useEngagementTracker(
    context.activeBookUrl.value,
    context.options.readerStore.currentChapterIndex,
  )

  watch(
    context.routeSessionKey,
    () => {
      void context.initReader()
    },
    { immediate: true },
  )

  onMounted(() => {
    context.options.offlineStore.loadCacheIndex()

    nextTick(() => {
      if (context.selectionContainerRef.value) {
        startTracking(context.selectionContainerRef.value)
      }
    })
  })

  onBeforeUnmount(() => {
    if (context.selectionContainerRef.value) {
      stopTracking(context.selectionContainerRef.value)
    }
  })

  onUnmounted(() => {
    context.options.readerStore.disposeReader()
  })
}
