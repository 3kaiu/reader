<script setup lang="ts">
import { DropdownMenuGroup } from 'reka-ui'
</script>

<template>
  <DropdownMenuGroup v-bind="$attrs">
    <slot />
  </DropdownMenuGroup>
</template>
