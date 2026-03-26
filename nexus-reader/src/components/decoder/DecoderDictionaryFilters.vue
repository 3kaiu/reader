<script setup lang="ts">
import { Filter } from 'lucide-vue-next'
import {
  DECODER_CATEGORY_OPTIONS,
  DECODER_LEVEL_OPTIONS,
} from '@/constants/decoderDictionary'
import type { DictionaryLevel, EntityCategory } from '@/types/decoder'

defineProps<{
  filterCategory: EntityCategory | 'all'
  filterLevel: DictionaryLevel | 'all'
}>()

const emit = defineEmits<{
  'update:filterCategory': [value: EntityCategory | 'all']
  'update:filterLevel': [value: DictionaryLevel | 'all']
}>()
</script>

<template>
  <div class="flex items-center gap-3 mb-4 flex-wrap">
    <div class="flex items-center gap-2">
      <Filter class="w-4 h-4 text-muted-foreground" />
      <span class="text-sm text-muted-foreground">筛选:</span>
    </div>

    <select
      :value="filterCategory"
      class="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
      @change="emit('update:filterCategory', ($event.target as HTMLSelectElement).value as EntityCategory | 'all')"
    >
      <option value="all">全部类别</option>
      <option
        v-for="option in DECODER_CATEGORY_OPTIONS"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>

    <select
      :value="filterLevel"
      class="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
      @change="emit('update:filterLevel', ($event.target as HTMLSelectElement).value as DictionaryLevel | 'all')"
    >
      <option value="all">全部层级</option>
      <option
        v-for="option in DECODER_LEVEL_OPTIONS"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>

    <span class="text-xs text-muted-foreground">
      导入导出使用精简 JSON：`original`、`real`、`category`，可选 `aliases`、`description`、`level`、`bookId`、`bookType`
    </span>
  </div>
</template>
