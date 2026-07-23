<script setup lang="ts">
import { SceneLoader } from '@/components/ui'
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md"
  >
    <div class="flex flex-col items-center gap-6">
      <SceneLoader scene="reader" :size="120" class="text-primary/30" />
      <p class="text-xs font-medium tracking-widest text-primary/40 uppercase">Loading Content</p>
    </div>
  </div>
</template>
