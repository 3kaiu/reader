<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'radix-vue'
import { type SheetVariants, sheetVariants } from '.'
import { cn } from '@/lib/utils'

interface SheetContentProps {
  class?: HTMLAttributes['class']
  side?: SheetVariants['side']
}

const props = defineProps<SheetContentProps>()

const emits = defineEmits<{
  openAutoFocus: [event: Event]
  closeAutoFocus: [event: Event]
  escapeKeyDown: [event: KeyboardEvent]
  interactOutside: [event: Event]
}>()

const delegatedProps = computed(() => {
  const { class: _, side, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      :class="cn(sheetVariants({ side }), props.class)"
      v-bind="forwarded"
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
