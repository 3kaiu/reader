import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { parseReaderRouteQuery } from '@/utils/readerRoute'
import type { ReaderSessionOptions } from './session-types'
import type { ReaderContentInstance } from './types'

export function createReaderSessionRouteState(
  options: ReaderSessionOptions,
) {
  const route = useRoute()
  const contentRef = ref<ReaderContentInstance>(null)
  const routeTarget = computed(() => parseReaderRouteQuery(route.query))
  const routeBookUrl = computed(() => routeTarget.value?.bookUrl || null)
  const routeSourceId = computed(() => routeTarget.value?.sourceId || null)
  const routeSessionKey = computed(
    () => `${routeSourceId.value || ''}::${routeBookUrl.value || ''}`,
  )
  const activeBookUrl = computed(
    () => options.readerStore.currentBook?.bookUrl || routeBookUrl.value || '',
  )
  const selectionContainerRef = computed<Element | null>(() =>
    contentRef.value?.$el?.querySelector('.reader-text') ?? null,
  )

  return {
    route,
    contentRef,
    routeTarget,
    routeBookUrl,
    routeSourceId,
    routeSessionKey,
    activeBookUrl,
    selectionContainerRef,
  }
}
