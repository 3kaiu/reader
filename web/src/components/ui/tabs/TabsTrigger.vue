<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { inject, computed } from 'vue'
import type { Ref } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  value: string
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()

const activeTab = inject<Ref<string>>('tabs-active')
const setActiveTab = inject<(value: string) => void>('tabs-set-active')

const isActive = computed(() => activeTab?.value === props.value)

function handleClick() {
  if (!props.disabled && setActiveTab) {
    setActiveTab(props.value)
  }
}
</script>

<template>
  <button
    role="tab"
    :aria-selected="isActive"
    :disabled="disabled"
    :class="
      cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive ? 'bg-background text-foreground shadow' : '',
        props.class
      )
    "
    @click="handleClick"
  >
    <span class="truncate">
      <slot />
    </span>
  </button>
</template>
