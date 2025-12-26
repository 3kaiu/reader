<script setup lang="ts">
import { DialogClose } from 'radix-vue'
import { Button } from '../button'
</script>

<template>
  <DialogClose as-child>
    <Button variant="outline">
      <slot />
    </Button>
  </DialogClose>
</template>
