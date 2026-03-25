<script setup lang="ts">
import {
  Edit2,
  Trash2,
} from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DECODER_CATEGORY_CONFIG,
  DECODER_LEVEL_CONFIG,
} from '@/constants/decoderDictionary'
import type { DictionaryEntry } from '@/types/decoder'
import { getDecoderEntryScopeLabel } from '@/utils/decoderDictionary'

interface Props {
  entry: DictionaryEntry
  isManageMode: boolean
  selected: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  edit: [entry: DictionaryEntry]
  delete: [entry: DictionaryEntry]
  'toggle-select': [entry: DictionaryEntry]
}>()
</script>

<template>
  <div
    class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
    :class="{
      'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
        selected && isManageMode,
      'border-border/50 hover:border-border hover:shadow-md': !selected,
    }"
    @click="isManageMode ? emit('toggle-select', entry) : emit('edit', entry)"
  >
    <div class="p-4 h-full flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <div class="shrink-0 relative mt-0.5">
            <div
              v-if="isManageMode"
              class="w-5 h-5 flex items-center justify-center"
              @click.stop="emit('toggle-select', entry)"
            >
              <Checkbox
                :checked="selected"
                @update:checked="emit('toggle-select', entry)"
                @click.stop
              />
            </div>
            <div
              v-else
              class="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary"
            >
              <component
                :is="DECODER_CATEGORY_CONFIG[entry.category].icon"
                class="h-4 w-4"
              />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-sm leading-tight mb-1 text-foreground">
              {{ entry.original }}
            </h3>
            <div class="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="secondary"
                class="rounded-md px-2 py-0.5 text-xs"
                :class="DECODER_LEVEL_CONFIG[entry.level].color"
              >
                {{ DECODER_LEVEL_CONFIG[entry.level].label }}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {{ getDecoderEntryScopeLabel(entry) }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ DECODER_CATEGORY_CONFIG[entry.category].label }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="!isManageMode"
          class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <button
            class="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="编辑"
            @click.stop="emit('edit', entry)"
          >
            <Edit2 class="h-3.5 w-3.5" />
          </button>
          <button
            class="w-7 h-7 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
            title="删除"
            @click.stop="emit('delete', entry)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div class="flex-1 pt-2 border-t border-border/40">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-muted-foreground">{{ entry.original }}</span>
          <span class="text-muted-foreground/60">→</span>
          <span class="font-medium text-primary">{{ entry.real }}</span>
        </div>
        <p v-if="entry.description" class="text-xs text-muted-foreground mt-1 line-clamp-2">
          {{ entry.description }}
        </p>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-border/40">
        <div class="text-xs text-muted-foreground">
          置信度: {{ entry.confidence }}%
        </div>
        <div class="text-xs text-muted-foreground">
          确认: {{ entry.confirmCount }} 次
        </div>
      </div>
    </div>
  </div>
</template>
