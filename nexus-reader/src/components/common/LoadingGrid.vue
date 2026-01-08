<script setup lang="ts">
/**
 * 通用加载状态网格组件
 */
const props = withDefaults(defineProps<{
  items?: number
  itemHeight?: string
}>(), {
  items: 12,
  itemHeight: '8rem',
})
</script>

<template>
  <div
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
  >
    <div
      v-for="i in items"
      :key="i"
      class="bg-card rounded-2xl border border-border/50 animate-pulse"
      :style="{ height: itemHeight }"
    ></div>
  </div>
</template>
