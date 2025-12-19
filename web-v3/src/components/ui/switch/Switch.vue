<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'radix-vue'
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
  <SwitchRoot
    :checked="checked"
    :disabled="disabled"
    :class="cn(
      'peer inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      $props.class
    )"
    @update:checked="(v) => emit('update:checked', v)"
  >
    <SwitchThumb
      :class="cn('pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0')"
    />
  </SwitchRoot>
</template>
