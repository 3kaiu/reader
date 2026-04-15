<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    message: string
    containerClass?: string
  }>(),
  {
  containerClass: 'py-12 text-center',
  }
)
</script>

<template>
  <div :class="containerClass">
    <Loader2 class="w-8 h-8 animate-spin mx-auto opacity-40" />
    <p class="text-sm opacity-40 mt-3">{{ message }}</p>
  </div>
</template>
