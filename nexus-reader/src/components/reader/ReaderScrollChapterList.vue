<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, watch } from 'vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import {
  VIRTUAL_SCROLL_OVERSCAN,
  VIRTUAL_SCROLL_THRESHOLD,
} from '@/constants/ui'
import ReaderScrollChapter from './ReaderScrollChapter.vue'
import {
  createReaderScrollChapterListBindings,
} from './reader-scroll-chapter-list-bindings'
import type {
  ReaderScrollChapterListProps,
} from './reader-scroll-chapter-list-prop-types'

const props = defineProps<ReaderScrollChapterListProps>()
const { chapterItemPropsList } = createReaderScrollChapterListBindings(props)

const CHAPTER_BASE_ESTIMATED_HEIGHT = 560
const CHAPTER_VISUAL_LINE_HEIGHT = 30
const CHAPTER_CHARS_PER_VISUAL_LINE = 34
const CHAPTER_HEIGHT_PADDING = 180

const shouldUseVirtualScroll = computed(
  () => chapterItemPropsList.value.length > VIRTUAL_SCROLL_THRESHOLD,
)

const estimateChapterHeight = (formattedContent?: string) => {
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
    estimateChapterHeight(chapterItemPropsList.value[index]?.chapter.formattedContent),
  overscan: VIRTUAL_SCROLL_OVERSCAN + 4,
  getItemKey: index => chapterItemPropsList.value[index]?.chapter.index ?? index,
})

watch(
  chapterItemPropsList,
  chapters => {
    if (!virtualizer.value) {
      return
    }

    virtualizer.value.setOptions({
      ...virtualizer.value.options,
      count: chapters.length,
    })
    virtualizer.value.measure()
  },
  { flush: 'post' },
)

const virtualItems = computed(() =>
  shouldUseVirtualScroll.value ? (virtualizer.value?.getVirtualItems() ?? []) : [],
)

const virtualTotalSize = computed(() =>
  shouldUseVirtualScroll.value ? (virtualizer.value?.getTotalSize() ?? 0) : 0,
)

const getChapterPropsByVirtualIndex = (index: number) => chapterItemPropsList.value[index]

const bindVirtualItemRef = (
  element: Element | ComponentPublicInstance | null,
) => {
  const target =
    element && '$el' in element ? (element.$el as Element | null) : element
  if (!(target instanceof HTMLElement)) {
    return
  }

  virtualizer.value?.measureElement(target)
}
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
        v-for="virtualItem in virtualItems"
        :key="`virtual-chapter-${virtualItem.key}`"
        :ref="bindVirtualItemRef"
        :data-virtual-index="virtualItem.index"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualItem.start}px)`,
        }"
      >
        <ReaderScrollChapter
          v-if="getChapterPropsByVirtualIndex(virtualItem.index)"
          v-bind="getChapterPropsByVirtualIndex(virtualItem.index)"
        />
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
