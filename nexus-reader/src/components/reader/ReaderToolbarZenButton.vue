<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  zenMode: boolean
}>()

const emit = defineEmits<{
  exit: []
}>()
</script>

<template>
  <Transition name="fade">
    <div
      v-if="zenMode"
      class="fixed top-6 right-6 z-50 animate-in fade-in duration-700"
    >
      <button
        class="w-10 h-10 rounded-full bg-background/20 hover:bg-background/40 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all hover:scale-110 active:scale-90"
        title="退出禅模式"
        @click="emit('exit')"
      >
        <X class="w-5 h-5 text-foreground/40 hover:text-foreground/80" />
      </button>
    </div>
  </Transition>
</template>
