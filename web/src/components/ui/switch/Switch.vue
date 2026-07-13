<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  checked?: boolean
  disabled?: boolean
  class?: string
}>()

const emit = defineEmits<{
  (e: 'update:checked', value: boolean): void
}>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :disabled="disabled"
    :class="
      cn(
        'peer inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        $props.class
      )
    "
    @click="emit('update:checked', !checked)"
  >
    <span
      :class="
        cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )
      "
    />
  </button>
</template>
