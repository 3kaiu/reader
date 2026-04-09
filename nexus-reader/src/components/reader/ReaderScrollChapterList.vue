<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import {
  VIRTUAL_SCROLL_OVERSCAN,
  VIRTUAL_SCROLL_THRESHOLD,
} from '@/constants/ui'
import { useSettingsStore } from '@/stores/settings'
import { hasPendingUserInput, scheduleIdleTask, type IdleTaskHandle } from '@/utils/browserScheduling'
import ReaderScrollChapter from './ReaderScrollChapter.vue'
import {
  createReaderScrollChapterListBindings,
} from './reader-scroll-chapter-list-bindings'
import type {
  ReaderScrollChapterListProps,
} from './reader-scroll-chapter-list-prop-types'

const props = defineProps<ReaderScrollChapterListProps>()
const settingsStore = useSettingsStore()
const { chapterItemPropsList } = createReaderScrollChapterListBindings(props)
let pendingVirtualMeasureRafId: number | null = null
let pendingVirtualMeasureIdleTask: IdleTaskHandle | null = null
let removeFontListeners: (() => void) | null = null
const measuredChapterHeightMap = new Map<number, number>()

const CHAPTER_BASE_ESTIMATED_HEIGHT = 560
const CHAPTER_VISUAL_LINE_HEIGHT = 30
const CHAPTER_CHARS_PER_VISUAL_LINE = 34
const CHAPTER_HEIGHT_PADDING = 180
const MAX_MEASURE_DEFER_COUNT = 3

const performanceMode = computed(() => settingsStore.config.performanceMode)
const virtualScrollThreshold = computed(() => {
  if (performanceMode.value === 'aggressive') {
    return Math.max(12, VIRTUAL_SCROLL_THRESHOLD - 4)
  }
  if (performanceMode.value === 'compat') {
    return VIRTUAL_SCROLL_THRESHOLD + 10
  }
  return VIRTUAL_SCROLL_THRESHOLD
})
const virtualOverscan = computed(() => {
  if (performanceMode.value === 'aggressive') {
    return VIRTUAL_SCROLL_OVERSCAN + 8
  }
  if (performanceMode.value === 'compat') {
    return VIRTUAL_SCROLL_OVERSCAN + 2
  }
  return VIRTUAL_SCROLL_OVERSCAN + 4
})

const shouldUseVirtualScroll = computed(
  () => chapterItemPropsList.value.length > virtualScrollThreshold.value,
)

const estimateChapterHeight = (virtualIndex: number, formattedContent?: string) => {
  const measuredHeight = measuredChapterHeightMap.get(
    chapterItemPropsList.value[virtualIndex]?.chapter.index ?? -1,
  )
  if (typeof measuredHeight === 'number' && measuredHeight > 0) {
    return measuredHeight
  }

  if (!formattedContent) {
    return CHAPTER_BASE_ESTIMATED_HEIGHT
  }

  const estimatedLines = Math.ceil(formattedContent.length / CHAPTER_CHARS_PER_VISUAL_LINE)
  return (
    CHAPTER_HEIGHT_PADDING +
    Math.max(CHAPTER_BASE_ESTIMATED_HEIGHT, estimatedLines * CHAPTER_VISUAL_LINE_HEIGHT)
  )
}

const virtualizer = useWindowVirtualizer({
  count: chapterItemPropsList.value.length,
  estimateSize: index =>
    estimateChapterHeight(
      index,
      chapterItemPropsList.value[index]?.chapter.formattedContent,
    ),
  overscan: virtualOverscan.value,
  getItemKey: index => chapterItemPropsList.value[index]?.chapter.index ?? index,
})

const cancelPendingVirtualMeasure = () => {
  if (pendingVirtualMeasureIdleTask) {
    pendingVirtualMeasureIdleTask.cancel()
    pendingVirtualMeasureIdleTask = null
  }
  if (pendingVirtualMeasureRafId !== null) {
    window.cancelAnimationFrame(pendingVirtualMeasureRafId)
    pendingVirtualMeasureRafId = null
  }
}

const scheduleVirtualMeasure = (timeoutMs = 180) => {
  if (!virtualizer.value) {
    return
  }

  cancelPendingVirtualMeasure()
  let deferredCount = 0
  const scheduleMeasure = () => {
    pendingVirtualMeasureRafId = window.requestAnimationFrame(() => {
      if (hasPendingUserInput() && deferredCount < MAX_MEASURE_DEFER_COUNT) {
        deferredCount += 1
        scheduleMeasure()
        return
      }
      pendingVirtualMeasureRafId = null
      pendingVirtualMeasureIdleTask = scheduleIdleTask(
        () => {
          pendingVirtualMeasureIdleTask = null
          virtualizer.value?.measure()
        },
        { timeoutMs },
      )
    })
  }
  scheduleMeasure()
}

watch(
  [chapterItemPropsList, virtualOverscan],
  ([chapters, overscan]) => {
    const activeChapterIndexSet = new Set(chapters.map(item => item.chapter.index))
    for (const chapterIndex of measuredChapterHeightMap.keys()) {
      if (!activeChapterIndexSet.has(chapterIndex)) {
        measuredChapterHeightMap.delete(chapterIndex)
      }
    }

    if (!virtualizer.value) {
      return
    }

    virtualizer.value.setOptions({
      ...virtualizer.value.options,
      count: chapters.length,
      overscan,
    })
    scheduleVirtualMeasure()
  },
  { flush: 'post' },
)

watch(
  () => props.layoutVersion,
  () => {
    measuredChapterHeightMap.clear()
    scheduleVirtualMeasure(120)
  },
  { flush: 'post' },
)

const virtualItems = computed(() =>
  shouldUseVirtualScroll.value ? (virtualizer.value?.getVirtualItems() ?? []) : [],
)

const virtualTotalSize = computed(() =>
  shouldUseVirtualScroll.value ? (virtualizer.value?.getTotalSize() ?? 0) : 0,
)

const virtualChapterItems = computed(() =>
  virtualItems.value
    .map(virtualItem => {
      const chapterProps = chapterItemPropsList.value[virtualItem.index]
      if (!chapterProps) {
        return null
      }
      return {
        virtualItem,
        chapterProps,
        chapterIndex: chapterProps.chapter.index,
      }
    })
    .filter(
      (
        item,
      ): item is {
        virtualItem: (typeof virtualItems.value)[number]
        chapterProps: (typeof chapterItemPropsList.value)[number]
        chapterIndex: number
      } => item !== null,
    ),
)

const bindVirtualItemRef = (
  element: Element | ComponentPublicInstance | null,
  chapterIndex: number,
) => {
  const target =
    element && '$el' in element ? (element.$el as Element | null) : element
  if (!(target instanceof HTMLElement)) {
    return
  }

  const measuredHeight = target.offsetHeight
  if (measuredChapterHeightMap.get(chapterIndex) === measuredHeight) {
    return
  }

  measuredChapterHeightMap.set(chapterIndex, measuredHeight)
  virtualizer.value?.measureElement(target)
}

onUnmounted(() => {
  measuredChapterHeightMap.clear()
  cancelPendingVirtualMeasure()
  if (removeFontListeners) {
    removeFontListeners()
    removeFontListeners = null
  }
})

onMounted(() => {
  if (typeof document === 'undefined' || !document.fonts) {
    return
  }

  const handleFontLoadEvent = () => {
    measuredChapterHeightMap.clear()
    scheduleVirtualMeasure(120)
  }

  void document.fonts.ready.then(() => {
    handleFontLoadEvent()
  })

  document.fonts.addEventListener('loadingdone', handleFontLoadEvent)
  document.fonts.addEventListener('loadingerror', handleFontLoadEvent)
  removeFontListeners = () => {
    document.fonts.removeEventListener('loadingdone', handleFontLoadEvent)
    document.fonts.removeEventListener('loadingerror', handleFontLoadEvent)
  }
})
</script>

<template>
  <template v-if="shouldUseVirtualScroll">
    <div
      :style="{
        height: `${virtualTotalSize}px`,
        position: 'relative',
      }"
    >
      <div
        v-for="virtualChapter in virtualChapterItems"
        :key="`virtual-chapter-${virtualChapter.virtualItem.key}`"
        :ref="el => bindVirtualItemRef(el, virtualChapter.chapterIndex)"
        :data-virtual-index="virtualChapter.virtualItem.index"
        :data-chapter-index="virtualChapter.chapterIndex"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualChapter.virtualItem.start}px)`,
        }"
      >
        <ReaderScrollChapter v-bind="virtualChapter.chapterProps" />
      </div>
    </div>
  </template>

  <template v-else>
    <ReaderScrollChapter
      v-for="chapterProps in chapterItemPropsList"
      :key="chapterProps.chapter.index"
      v-bind="chapterProps"
    />
  </template>
</template>
