<script setup lang="ts">
import { DropdownMenuTrigger } from 'reka-ui'
</script>

<template>
  <DropdownMenuTrigger class="outline-none" v-bind="$attrs">
    <slot />
  </DropdownMenuTrigger>
</template>
