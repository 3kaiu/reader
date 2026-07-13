<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '.'
import { cn } from '@/lib/utils'
import { buttonVariants } from '.'

interface Props {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  type: 'button',
})
</script>

<template>
  <button :type="type" :disabled="disabled" :class="cn(buttonVariants({ variant, size }), $props.class)">
    <slot />
  </button>
</template>
