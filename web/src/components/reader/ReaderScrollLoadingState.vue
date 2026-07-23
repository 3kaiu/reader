<script setup lang="ts">
import { SceneLoader } from '@/components/ui'

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
    <SceneLoader scene="readerScroll" :size="48" class="mx-auto opacity-40" />
    <p class="text-sm opacity-40 mt-3">{{ message }}</p>
  </div>
</template>
