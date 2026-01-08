<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { ToastRoot, type ToastRootEmits, type ToastRootProps, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'
import { toastVariants } from './toast-variants'

const props = defineProps<ToastRootProps & { class?: HTMLAttributes['class']; variant?: 'default' | 'destructive' }>()

const emits = defineEmits<ToastRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, variant: __, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ToastRoot
    v-bind="forwarded"
    :class="cn(toastVariants({ variant }), props.class)"
    @update:open="onOpenChange"
  >
    <slot />
  </ToastRoot>
</template>
