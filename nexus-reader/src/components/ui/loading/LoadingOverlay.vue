<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

interface Props {
  text?: string
  backdrop?: boolean
  fullScreen?: boolean
}

withDefaults(defineProps<Props>(), {
  text: '加载中...',
  backdrop: true,
  fullScreen: false,
})
</script>

<template>
  <div
    :class="[
      'flex items-center justify-center z-50',
      fullScreen ? 'fixed inset-0' : 'absolute inset-0',
      backdrop ? 'bg-background/80 backdrop-blur-sm' : 'bg-transparent',
    ]"
  >
    <div class="flex flex-col items-center justify-center gap-3">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
      <p v-if="text" class="text-sm text-muted-foreground">{{ text }}</p>
    </div>
  </div>
</template>
