<script setup lang="ts">
import {
  Brain,
  Filter,
} from 'lucide-vue-next'
import {
  AI_MAPPING_FILTER_OPTIONS,
} from '@/constants/aiAnalysis'
import type { AiMappingFilterType } from '@/utils/aiAnalysisStore'

defineProps<{
  total: number
  enabled: number
  filterType: AiMappingFilterType
}>()

const emit = defineEmits<{
  'update:filterType': [value: AiMappingFilterType]
}>()
</script>

<template>
  <div class="flex items-center gap-3 mb-6">
    <div class="flex items-center gap-2 shrink-0">
      <Brain class="w-4 h-4 text-primary" />
      <h2
        class="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"
      >
        全部规则
        <span class="text-xs font-normal text-muted-foreground/60 normal-case">
          ({{ total }})
        </span>
      </h2>
    </div>

    <div class="flex-1"></div>

    <div class="flex items-center gap-3 shrink-0">
      <div
        class="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md border border-border"
      >
        <span
          class="w-1.5 h-1.5 rounded-full"
          style="background-color: #22c55e"
        ></span>
        <span>启用 {{ enabled }}</span>
      </div>
    </div>

    <div class="relative">
      <select
        :value="filterType"
        class="pl-9 pr-4 h-9 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        @change="emit('update:filterType', ($event.target as HTMLSelectElement).value as AiMappingFilterType)"
      >
        <option
          v-for="option in AI_MAPPING_FILTER_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <Filter
        class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
      />
    </div>
  </div>
</template>
