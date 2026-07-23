<script setup lang="ts">
import { ArrowDown, ArrowUp, CloudDownload, Locate, RotateCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { SceneLoader } from '@/components/ui'

defineProps<{
  isReverse: boolean
  loading?: boolean
  showCacheControls: boolean
  isDownloading?: boolean
}>()

const emit = defineEmits<{
  'toggle-reverse': []
  'scroll-to-current': []
  refresh: []
  'download-all': []
}>()
</script>

<template>
  <div class="flex items-center gap-1 mb-3">
    <Button
      variant="outline"
      size="sm"
      class="flex-1 h-8 text-xs gap-1"
      @click="emit('toggle-reverse')"
    >
      <ArrowDown v-if="!isReverse" class="h-3.5 w-3.5" />
      <ArrowUp v-else class="h-3.5 w-3.5" />
      {{ isReverse ? '倒序' : '正序' }}
    </Button>

    <Button
      variant="outline"
      size="sm"
      class="flex-1 h-8 text-xs gap-1"
      @click="emit('scroll-to-current')"
    >
      <Locate class="h-3.5 w-3.5" />
      定位
    </Button>

    <Button variant="outline" size="sm" class="flex-1 h-8 text-xs gap-1" @click="emit('refresh')">
      <SceneLoader v-if="loading" scene="chapterRefresh" :size="16" class="text-current" />
      <RotateCw v-else class="h-3.5 w-3.5" />
      刷新
    </Button>

    <Button
      v-if="showCacheControls"
      variant="outline"
      size="sm"
      class="flex-1 h-8 text-xs gap-1"
      :disabled="isDownloading"
      @click="emit('download-all')"
    >
      <CloudDownload class="h-3.5 w-3.5" :class="{ 'animate-pulse': isDownloading }" />
      {{ isDownloading ? '下载中' : '缓存全本' }}
    </Button>
  </div>
</template>
