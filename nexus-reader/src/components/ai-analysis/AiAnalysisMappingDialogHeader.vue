<script setup lang="ts">
import { X } from 'lucide-vue-next'
import type { AiMappingRule } from '@/types/ai-analysis'

defineProps<{
  editingRule: AiMappingRule | null
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold">
      {{ editingRule ? '编辑映射规则' : '添加映射规则' }}
    </h3>
    <button
      class="p-1.5 rounded-lg hover:bg-muted transition-colors"
      @click="emit('close')"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>
