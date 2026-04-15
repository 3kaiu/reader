<script setup lang="ts">
defineProps<{
  visible: boolean
}>()
</script>

<template>
  <section class="mb-8">
    <div class="rounded-2xl border border-border/50 bg-card p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold">高级治理与工具箱</p>
          <p class="text-xs text-muted-foreground mt-1">
            包含源规则包、Agent 路由和调试工具，默认从日常设置中下沉。
          </p>
        </div>
        <span
          class="h-8 px-3 rounded-full border bg-background text-xs inline-flex items-center"
        >
          {{ visible ? '已展开' : '已隐藏' }}
        </span>
      </div>
    </div>
  </section>
</template>
