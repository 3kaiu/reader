<script setup lang="ts">
import { computed } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  searchKeyword: string
}>()

const emit = defineEmits<{
  'update:search-keyword': [value: string]
  'clear-search': []
}>()

const searchKeywordModel = computed({
  get: () => props.searchKeyword,
  set: (value: string) => emit('update:search-keyword', value),
})
</script>

<template>
  <div class="relative">
    <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input
      v-model="searchKeywordModel"
      placeholder="搜索章节..."
      class="pl-9 h-9 text-sm bg-muted/50 rounded-lg border-0"
    />
    <button
      v-if="searchKeyword"
      class="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-muted rounded-full p-1"
      @click="emit('clear-search')"
    >
      <X class="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  </div>
</template>
