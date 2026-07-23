<script setup lang="ts">
/**
 * 通用加载状态组件 — 数学曲线动效
 */
import { SceneLoader } from '@/components/ui'

withDefaults(
  defineProps<{
    items?: number
    itemHeight?: string
  }>(),
  {
    items: 12,
    itemHeight: '8rem',
  }
)
</script>

<template>
  <div class="flex items-center justify-center py-16">
    <SceneLoader scene="general" :size="64" class="text-primary/30" />
  </div>
</template>
