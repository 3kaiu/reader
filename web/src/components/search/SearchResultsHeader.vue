<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

defineProps<{
  loading: boolean
  resultCount: number
  errorCount?: number
}>()

const emit = defineEmits<{
  (e: 'stop-search'): void
}>()
</script>

<template>
  <div
    class="flex items-center justify-between mb-6 px-1 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100"
  >
    <div class="flex items-center gap-3">
      <span class="text-sm font-semibold text-foreground">搜索结果</span>
      <Badge v-if="loading" variant="secondary" class="gap-1.5">
        <Loader2 class="h-3 w-3 animate-spin" />
        搜索中...
      </Badge>
      <Badge v-else-if="resultCount > 0" variant="secondary"> {{ resultCount }} 本 </Badge>
      <Badge
        v-if="(errorCount || 0) > 0"
        variant="outline"
        class="border-amber-500/30 text-amber-700 dark:text-amber-300"
      >
        {{ errorCount }} 个失败源
      </Badge>
    </div>
    <div class="flex items-center gap-2">
      <Button
        v-if="loading"
        variant="destructive"
        size="sm"
        class="rounded-full text-xs h-7 px-3"
        aria-label="停止搜索"
        @click="emit('stop-search')"
      >
        停止搜索
      </Button>
    </div>
  </div>
</template>
