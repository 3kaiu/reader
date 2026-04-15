<script setup lang="ts">
import { DropdownMenuRoot } from 'reka-ui'
</script>

<template>
  <DropdownMenuRoot v-bind="$attrs">
    <slot />
  </DropdownMenuRoot>
</template>
