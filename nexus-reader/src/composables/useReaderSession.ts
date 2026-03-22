import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEngagementTracker } from '@/composables/useEngagementTracker'
import { useDecoderStore } from '@/stores/decoder'
import { useOfflineStore } from '@/stores/offlineStorage'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { parseReaderRouteQuery } from '@/utils/readerRoute'

type ReaderToast = (payload: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}) => unknown

type ReaderContentInstance = {
  swipeContentRef?: HTMLElement | null
  $el?: Element
} | null

export function useReaderSession(options: {
  toast: ReaderToast
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  offlineStore: ReturnType<typeof useOfflineStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  decoderAddonEnabled: boolean
}) {
  const route = useRoute()
  const router = useRouter()
  const contentRef = ref<ReaderContentInstance>(null)
  const routeTarget = computed(() => parseReaderRouteQuery(route.query))
  const routeBookUrl = computed(() => routeTarget.value?.bookUrl || null)
  const routeSourceId = computed(() => routeTarget.value?.sourceId || null)
  const routeSessionKey = computed(
    () => `${routeSourceId.value || ''}::${routeBookUrl.value || ''}`
  )
  const activeBookUrl = computed(
    () => options.readerStore.currentBook?.bookUrl || routeBookUrl.value || ''
  )
  const selectionContainerRef = computed<Element | null>(() =>
    options.settingsStore.config.readingMode === 'swipe'
      ? contentRef.value?.swipeContentRef ?? null
      : contentRef.value?.$el?.querySelector('.reader-text') ?? null
  )

  const { startTracking, stopTracking } = useEngagementTracker(
    activeBookUrl.value,
    options.readerStore.currentChapterIndex
  )

  async function initReader() {
    const target = routeTarget.value
    if (!target) {
      options.toast({ title: '缺少书籍信息', variant: 'destructive' })
      router.push('/')
      return
    }

    options.settingsStore.applyAutoNightMode()

    if (options.decoderAddonEnabled) {
      options.decoderStore.setCurrentBook(target.bookUrl)
    }

    try {
      const response = await options.readerStore.startReaderSession(
        target.sourceId,
        target.bookUrl
      )
      if (!response.isSuccess) {
        options.toast({
          title: response.errorMsg || '获取书籍信息失败',
          variant: 'destructive',
        })
      }
    } catch {
      options.toast({ title: '加载书籍失败', variant: 'destructive' })
    }
  }

  watch(routeSessionKey, () => {
    void initReader()
  }, { immediate: true })

  onMounted(() => {
    options.offlineStore.loadCacheIndex()

    nextTick(() => {
      if (selectionContainerRef.value) {
        startTracking(selectionContainerRef.value)
      }
    })
  })

  onBeforeUnmount(() => {
    if (selectionContainerRef.value) {
      stopTracking(selectionContainerRef.value)
    }
  })

  onUnmounted(() => {
    options.readerStore.disposeReader()
  })

  return {
    contentRef,
    routeTarget,
    routeBookUrl,
    routeSourceId,
    activeBookUrl,
    selectionContainerRef,
    initReader,
  }
}
