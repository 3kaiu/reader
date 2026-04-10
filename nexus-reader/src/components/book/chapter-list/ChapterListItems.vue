<script setup lang="ts">
import { Check, Search } from 'lucide-vue-next'
import { Skeleton } from '@/components/ui'
import type { ChapterListVirtualItem } from './types'

defineProps<{
  loading?: boolean
  chaptersCount: number
  currentInd: number
  list: ChapterListVirtualItem[]
  containerProps: Record<string, unknown>
  wrapperProps: Record<string, unknown>
  isCached?: (index: number) => boolean
}>()

const emit = defineEmits<{
  select: [item: ChapterListVirtualItem]
}>()
</script>

<template>
  <div v-if="loading && chaptersCount === 0" class="p-4 space-y-4">
    <Skeleton v-for="i in 12" :key="i" width="100%" height="20px" class-name="rounded" />
  </div>

  <div v-else class="flex-1 overflow-hidden relative" v-bind="containerProps">
    <div v-bind="wrapperProps">
      <div
        v-for="item in list"
        :key="item.index"
        class="h-[52px] px-4 flex items-center cursor-pointer transition-all relative group"
        :class="[
          item.data.originalIndex === currentInd
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted/50',
          item.data.originalIndex < currentInd ? 'opacity-60' : '',
        ]"
        @click="emit('select', item)"
      >
        <div
          v-if="item.data.originalIndex === currentInd"
          class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"
        />

        <span
          class="w-10 flex-shrink-0 text-right mr-3 text-xs font-mono"
          :class="item.data.originalIndex === currentInd ? 'text-primary' : 'text-muted-foreground'"
        >
          {{ item.data.originalIndex + 1 }}
        </span>

        <span
          class="truncate text-sm flex-1"
          :class="item.data.originalIndex === currentInd ? 'font-semibold' : ''"
        >
          {{ item.data.title }}
        </span>

        <span
          v-if="isCached?.(item.data.originalIndex)"
          class="text-primary/60 ml-2"
          title="已缓存"
        >
          <Check class="w-3.5 h-3.5" />
        </span>

        <span
          v-else-if="item.data.originalIndex < currentInd"
          class="text-xs text-muted-foreground ml-2"
        >
          ✓
        </span>
      </div>
    </div>

    <div
      v-if="list.length === 0"
      class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm"
    >
      <Search class="w-10 h-10 opacity-30 mb-3" />
      未找到相关章节
    </div>
  </div>
</template>
