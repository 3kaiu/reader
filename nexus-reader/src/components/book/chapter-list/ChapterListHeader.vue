<script setup lang="ts">
import { X } from 'lucide-vue-next'
import ChapterListHeaderActions from './ChapterListHeaderActions.vue'
import ChapterListHeaderCurrentReading from './ChapterListHeaderCurrentReading.vue'
import ChapterListHeaderDownloadProgress from './ChapterListHeaderDownloadProgress.vue'
import ChapterListHeaderInfo from './ChapterListHeaderInfo.vue'
import ChapterListHeaderSearch from './ChapterListHeaderSearch.vue'
import type { ChapterListDownloadProgress } from './types'
import { SheetClose, SheetHeader, SheetTitle } from '@/components/ui/sheet'

defineProps<{
  bookName?: string
  chaptersCount: number
  currentInd: number
  loading?: boolean
  searchKeyword: string
  isReverse: boolean
  showCacheControls: boolean
  isDownloading?: boolean
  downloadProgress?: ChapterListDownloadProgress
  currentProgressPercent: number
  currentChapterTitle: string
}>()

const emit = defineEmits<{
  'update:searchKeyword': [value: string]
  'toggle-reverse': []
  'scroll-to-current': []
  refresh: []
  'download-all': []
  'clear-search': []
}>()
</script>

<template>
  <SheetHeader class="px-4 pt-4 pb-3 border-b space-y-0">
    <div class="flex items-center justify-between mb-3">
      <SheetTitle class="text-lg font-bold">目录</SheetTitle>
      <SheetClose class="rounded-full p-1.5 hover:bg-muted transition-colors">
        <X class="h-4 w-4" />
      </SheetClose>
    </div>

    <ChapterListHeaderInfo :book-name="bookName" :chapters-count="chaptersCount" />

    <ChapterListHeaderActions
      :is-reverse="isReverse"
      :loading="loading"
      :show-cache-controls="showCacheControls"
      :is-downloading="isDownloading"
      @toggle-reverse="emit('toggle-reverse')"
      @scroll-to-current="emit('scroll-to-current')"
      @refresh="emit('refresh')"
      @download-all="emit('download-all')"
    />

    <ChapterListHeaderDownloadProgress
      v-if="showCacheControls && isDownloading"
      :download-progress="downloadProgress"
    />

    <ChapterListHeaderSearch
      :search-keyword="searchKeyword"
      @update:search-keyword="emit('update:searchKeyword', $event)"
      @clear-search="emit('clear-search')"
    />

    <ChapterListHeaderCurrentReading
      v-if="currentInd >= 0 && !searchKeyword"
      :current-ind="currentInd"
      :current-progress-percent="currentProgressPercent"
      :current-chapter-title="currentChapterTitle"
    />
  </SheetHeader>
</template>
