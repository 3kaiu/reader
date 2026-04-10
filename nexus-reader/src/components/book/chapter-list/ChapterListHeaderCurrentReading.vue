<script setup lang="ts">
defineProps<{
  currentInd: number
  currentProgressPercent: number
  currentChapterTitle: string
}>()
</script>

<template>
  <div class="mt-3 px-3 py-2.5 bg-primary/5 rounded-lg border border-primary/10">
    <div class="flex items-center justify-between text-xs mb-1">
      <span class="opacity-60">正在阅读</span>
      <span class="text-primary font-semibold">{{ currentProgressPercent }}%</span>
    </div>
    <p class="text-sm truncate font-medium">
      第 {{ currentInd + 1 }} 章 · {{ currentChapterTitle }}
    </p>
  </div>
</template>
