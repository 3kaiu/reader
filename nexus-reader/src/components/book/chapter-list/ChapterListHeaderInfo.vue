<script setup lang="ts">
defineProps<{
  bookName?: string
  chaptersCount: number
}>()
</script>

<template>
  <div class="flex items-center gap-3 mb-3">
    <div
      class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0"
    >
      <span class="text-lg">📖</span>
    </div>
    <div class="flex-1 min-w-0">
      <p class="font-medium truncate text-sm">{{ bookName || '未知书籍' }}</p>
      <p class="text-xs text-muted-foreground">共 {{ chaptersCount }} 章</p>
    </div>
  </div>
</template>
