<script setup lang="ts">
import { DialogClose } from 'reka-ui'
import { Button } from '../button'
</script>

<template>
  <DialogClose as-child>
    <Button variant="outline">
      <slot />
    </Button>
  </DialogClose>
</template>
