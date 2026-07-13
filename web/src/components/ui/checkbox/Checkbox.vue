<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { Check } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = defineProps<{
  checked?: boolean
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  (e: 'update:checked', value: boolean): void
}>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="checked"
    :disabled="disabled"
    :class="
      cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary text-primary-foreground' : '',
        props.class
      )
    "
    @click="emit('update:checked', !checked)"
  >
    <span class="flex h-full w-full items-center justify-center text-current">
      <Check v-if="checked" class="h-4 w-4" />
    </span>
  </button>
</template>
