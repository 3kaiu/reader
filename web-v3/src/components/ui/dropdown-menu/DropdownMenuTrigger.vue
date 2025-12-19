<script setup lang="ts">
import { DropdownMenuTrigger } from 'radix-vue'
</script>

<template>
  <DropdownMenuTrigger class="outline-none" v-bind="$attrs">
    <slot />
  </DropdownMenuTrigger>
</template>
