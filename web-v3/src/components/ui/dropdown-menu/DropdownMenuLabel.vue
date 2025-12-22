<script setup lang="ts">
import { DropdownMenuLabel } from 'radix-vue'
import { cn } from '@/lib/utils'

defineProps<{ class?: string; inset?: boolean }>()
</script>

<template>
  <DropdownMenuLabel
    :class="cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', $props.class)"
    v-bind="$attrs"
  >
    <slot />
  </DropdownMenuLabel>
</template>
