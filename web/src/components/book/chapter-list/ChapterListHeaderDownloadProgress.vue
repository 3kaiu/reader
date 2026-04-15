<script setup lang="ts">
import { computed } from 'vue'
import type { ChapterListDownloadProgress } from './types'

const props = defineProps<{
  downloadProgress?: ChapterListDownloadProgress
}>()

const downloadProgressPercent = computed(() => {
  if (!props.downloadProgress) {
    return 0
  }

  const total = props.downloadProgress.total || 1
  return (props.downloadProgress.current / total) * 100
})
</script>

<template>
  <div class="mb-3 px-1">
    <div class="flex items-center justify-between text-[10px] mb-1 opacity-60">
      <span>正在缓存剩余章节...</span>
      <span>{{ downloadProgress?.current }} / {{ downloadProgress?.total }}</span>
    </div>
    <div class="h-1 bg-muted rounded-full overflow-hidden">
      <div
        class="h-full bg-primary transition-all duration-300"
        :style="{ width: `${downloadProgressPercent}%` }"
      />
    </div>
  </div>
</template>
