<script setup lang="ts">
import { CheckCircle2, CloudDownload } from 'lucide-vue-next'

interface Props {
  unreadCount: number
  manageMode: boolean
  cachePercent: number
  isFullyCached: boolean
  showProgress: boolean
  progress: number
}

defineProps<Props>()
</script>

<template>
  <div v-if="unreadCount > 0 && !manageMode" class="absolute top-2 right-2 z-20">
    <span
      class="min-w-[16px] h-[16px] px-1.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-black rounded-full shadow-premium ring-2 ring-background"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>
  </div>

  <div
    v-if="cachePercent > 0 && !manageMode"
    class="absolute bottom-2 left-2 z-20 flex items-center"
  >
    <div
      class="flex items-center gap-1.5 px-2 py-0.5 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 shadow-premium"
      :class="isFullyCached ? 'text-green-400' : 'text-blue-400'"
    >
      <CheckCircle2 v-if="isFullyCached" class="w-2.5 h-2.5" />
      <CloudDownload v-else class="w-2.5 h-2.5 animate-pulse" />
      <span v-if="!isFullyCached" class="text-[9px] font-black tracking-tighter">
        {{ cachePercent }}%
      </span>
    </div>
  </div>

  <div
    v-if="showProgress && progress > 0 && !manageMode"
    class="absolute bottom-0 inset-x-0 h-1 bg-black/10 z-10"
  >
    <div
      class="h-full bg-primary transition-all duration-1000 ease-soft"
      :style="{ width: `${progress}%` }"
    />
  </div>
</template>
