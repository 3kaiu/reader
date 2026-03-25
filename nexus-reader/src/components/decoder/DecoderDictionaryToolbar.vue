<script setup lang="ts">
import { BookOpen } from 'lucide-vue-next'
import { PageToolbar } from '@/components/common'

defineProps<{
  filteredCount: number
  personCount: number
  companyCount: number
  placeCount: number
  isManageMode: boolean
}>()

const emit = defineEmits<{
  'toggle-manage': []
}>()
</script>

<template>
  <PageToolbar
    title="解密词典"
    :icon="BookOpen"
    :count="filteredCount"
    :stats="[
      { label: '人物', value: personCount, color: '#3b82f6' },
      { label: '公司', value: companyCount, color: '#8b5cf6' },
      { label: '地点', value: placeCount, color: '#22c55e' },
    ]"
    :is-manage-mode="isManageMode"
    @toggle-manage="emit('toggle-manage')"
  />
</template>
