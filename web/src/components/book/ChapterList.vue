<script setup lang="ts">
import { useChapterListView } from '@/composables/useChapterListView'
import ChapterListHeader from '@/components/book/chapter-list/ChapterListHeader.vue'
import ChapterListItems from '@/components/book/chapter-list/ChapterListItems.vue'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { Chapter } from '@/types/book'
import type {
  ChapterListDownloadProgress,
  ChapterListVirtualItem,
} from '@/components/book/chapter-list/types'

const props = defineProps<{
  open: boolean
  chapters: Chapter[]
  currentInd: number
  loading?: boolean
  bookName?: string
  isCached?: (index: number) => boolean
  isDownloading?: boolean
  downloadProgress?: ChapterListDownloadProgress
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select', index: number): void
  (e: 'refresh'): void
  (e: 'downloadAll'): void
}>()

const {
  searchKeyword,
  isReverse,
  showCacheControls,
  currentProgressPercent,
  currentChapterTitle,
  list,
  containerProps,
  wrapperProps,
  handleSelect,
  toggleReverse,
  clearSearch,
  scrollToCurrent,
  handleRefresh,
  handleDownloadAll,
} = useChapterListView({
  props,
  onSelect: index => emit('select', index),
  onClose: () => emit('update:open', false),
  onRefresh: () => emit('refresh'),
  onDownloadAll: () => emit('downloadAll'),
})

function updateSearchKeyword(value: string) {
  searchKeyword.value = value
}

function handleListSelect(item: ChapterListVirtualItem) {
  handleSelect(item)
}
</script>

<template>
  <Sheet :open="open" @update:open="val => emit('update:open', val)">
    <SheetContent side="left" class="w-[320px] sm:w-[400px] p-0 flex flex-col gap-0">
      <ChapterListHeader
        :book-name="bookName"
        :chapters-count="chapters.length"
        :current-ind="currentInd"
        :loading="loading"
        :search-keyword="searchKeyword"
        :is-reverse="isReverse"
        :show-cache-controls="showCacheControls"
        :is-downloading="isDownloading"
        :download-progress="downloadProgress"
        :current-progress-percent="currentProgressPercent"
        :current-chapter-title="currentChapterTitle"
        @update:search-keyword="updateSearchKeyword"
        @toggle-reverse="toggleReverse"
        @scroll-to-current="scrollToCurrent"
        @refresh="handleRefresh"
        @download-all="handleDownloadAll"
        @clear-search="clearSearch"
      />

      <ChapterListItems
        :loading="loading"
        :chapters-count="chapters.length"
        :current-ind="currentInd"
        :list="list"
        :container-props="containerProps"
        :wrapper-props="wrapperProps"
        :is-cached="isCached"
        @select="handleListSelect"
      />

      <div
        class="h-4 bg-gradient-to-t from-background to-transparent -mt-4 relative z-10 pointer-events-none"
      />
    </SheetContent>
  </Sheet>
</template>
