<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('relative overflow-hidden', $props.class)">
    <div class="h-full w-full rounded-[inherit] overflow-auto [scrollbar-width:none] [-ms-overflow-style:none]">
      <slot />
    </div>
  </div>
</template>
