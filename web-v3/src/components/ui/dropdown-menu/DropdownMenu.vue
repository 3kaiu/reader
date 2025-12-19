<script setup lang="ts">
import { DropdownMenuRoot } from 'radix-vue'
</script>

<template>
  <DropdownMenuRoot v-bind="$attrs">
    <slot />
  </DropdownMenuRoot>
</template>
