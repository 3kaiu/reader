<script setup lang="ts">
interface Props {
  name: string
  author?: string
  progress: number
}

defineProps<Props>()
</script>

<template>
  <div class="mt-3 space-y-1 px-1">
    <h3
      class="text-[14px] font-bold text-foreground/90 leading-tight truncate group-hover:text-primary transition-colors tracking-tight"
    >
      {{ name }}
    </h3>
    <div class="flex items-center justify-between">
      <p class="text-[11px] text-muted-foreground/50 truncate font-medium tracking-wide">
        {{ author || '未知作者' }}
      </p>
      <span v-if="progress > 0" class="text-[10px] text-primary/40 font-black">
        {{ progress }}%
      </span>
    </div>
  </div>
</template>
