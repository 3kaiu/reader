import {
  nextTick,
  onBeforeUnmount,
  onMounted,
} from 'vue'
import { useEngagementTracker } from '@/composables/useEngagementTracker'
import type {
  ReaderSessionLifecycleContext,
} from './session-lifecycle-context-types'

export function setupReaderSessionEngagementLifecycle(
  context: ReaderSessionLifecycleContext,
) {
  const { startTracking, stopTracking } = useEngagementTracker(
    context.activeBookUrl.value,
    context.options.readerStore.currentChapterIndex,
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
}
