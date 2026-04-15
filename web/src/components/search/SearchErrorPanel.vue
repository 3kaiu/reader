<script setup lang="ts">
defineProps<{
  errors: Array<{
    sourceId: string
    sourceName: string
    error: string
  }>
}>()
</script>

<template>
  <div
    v-if="errors.length > 0"
    class="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
  >
    <div class="flex items-center justify-between gap-3 mb-3">
      <div>
        <p class="text-sm font-semibold text-foreground">部分书源搜索失败</p>
        <p class="text-xs text-muted-foreground mt-1">
          当前已展示成功返回的结果，下面是失败书源明细
        </p>
      </div>
      <span class="text-xs font-medium text-amber-700 dark:text-amber-300">
        {{ errors.length }} 个失败源
      </span>
    </div>

    <div class="space-y-2">
      <div
        v-for="item in errors"
        :key="item.sourceId"
        class="rounded-xl border border-border/60 bg-background/80 px-3 py-2"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-foreground">
            {{ item.sourceName }}
          </span>
          <span class="text-[10px] text-muted-foreground font-mono">
            {{ item.sourceId }}
          </span>
        </div>
        <p class="text-xs text-muted-foreground mt-1 break-all">
          {{ item.error }}
        </p>
      </div>
    </div>
  </div>
</template>
