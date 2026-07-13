<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  orientation?: 'horizontal' | 'vertical'
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void
}>()

// Get the first value from the array (single-thumb slider)
const currentValue = computed(() => props.modelValue?.[0] ?? props.min ?? 0)

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  emit('update:modelValue', [value])
}
</script>

<template>
  <div
    :class="
      cn(
        'relative flex w-full touch-none select-none items-center',
        orientation === 'vertical' ? 'flex-col w-1.5 h-full' : '',
        props.class
      )
    "
  >
    <!-- Track -->
    <div
      :class="
        cn(
          'relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20',
          orientation === 'vertical' ? 'w-1.5' : ''
        )
      "
    >
      <!-- Range (filled portion) -->
      <div
        :class="
          cn(
            'absolute h-full bg-primary',
            orientation === 'vertical' ? 'w-full bottom-0' : 'left-0'
          )
        "
        :style="
          orientation === 'vertical'
            ? { height: `${((currentValue - (min ?? 0)) / ((max ?? 100) - (min ?? 0))) * 100}%` }
            : { width: `${((currentValue - (min ?? 0)) / ((max ?? 100) - (min ?? 0))) * 100}%` }
        "
      />
    </div>

    <!-- Native range input (invisible but functional) -->
    <input
      type="range"
      :value="currentValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :orientation="orientation"
      class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      :class="orientation === 'vertical' ? '[writing-mode:bt-lr] [-webkit-appearance:slider-vertical]' : ''"
      @input="onInput"
    />
  </div>
</template>
