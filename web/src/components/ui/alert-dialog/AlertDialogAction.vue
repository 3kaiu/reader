<script setup lang="ts">
import { DialogClose } from 'reka-ui'
import { Button } from '../button'

defineProps<{
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
}>()
</script>

<template>
  <DialogClose as-child>
    <Button :variant="variant || 'default'">
      <slot />
    </Button>
  </DialogClose>
</template>
