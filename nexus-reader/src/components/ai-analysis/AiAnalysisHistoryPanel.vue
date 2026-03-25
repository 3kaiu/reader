<script setup lang="ts">
import {
  History,
  Trash2,
} from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AiAnalysisHistory } from '@/types/ai-analysis'

interface Props {
  history: AiAnalysisHistory[]
}

defineProps<Props>()

const emit = defineEmits<{
  clear: []
}>()
</script>

<template>
  <div class="mb-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <History class="h-4 w-4 text-primary" />
        <h3 class="font-semibold text-sm">分析历史</h3>
        <Badge variant="secondary" class="text-xs">
          {{ history.length }}
        </Badge>
      </div>
      <Button
        v-if="history.length > 0"
        variant="ghost"
        size="sm"
        class="gap-2"
        @click="emit('clear')"
      >
        <Trash2 class="h-4 w-4" />
        清除
      </Button>
    </div>

    <div
      v-if="history.length === 0"
      class="p-8 text-center text-sm text-muted-foreground bg-muted/30 rounded-xl"
    >
      暂无分析历史
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="item in history.slice(0, 5)"
        :key="item.id"
        class="p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm mb-1 truncate">
              {{ item.bookTitle }}
            </div>
            <div class="text-xs text-muted-foreground mb-2">
              {{ item.chapterTitle }}
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <Badge
                v-for="mapping in item.mappings.slice(0, 4)"
                :key="mapping.id"
                variant="outline"
                class="text-xs"
              >
                {{ mapping.original }} → {{ mapping.target }}
              </Badge>
              <span
                v-if="item.mappings.length > 4"
                class="text-xs text-muted-foreground"
              >
                +{{ item.mappings.length - 4 }}
              </span>
            </div>
          </div>
          <div class="text-xs text-muted-foreground shrink-0">
            {{ new Date(item.analyzedAt).toLocaleDateString() }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
