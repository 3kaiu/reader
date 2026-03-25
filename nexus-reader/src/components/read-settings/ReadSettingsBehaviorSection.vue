<script setup lang="ts">
import type { ReaderConfig } from '@/types/settings'

interface Props {
  config: ReaderConfig
}

defineProps<Props>()

const emit = defineEmits<{
  'toggle-auto-night-mode': []
}>()
</script>

<template>
  <section>
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-medium">自动夜间模式</h3>
        <p class="text-xs text-muted-foreground mt-0.5">
          {{ config.nightModeStartHour }}:00 - {{ config.nightModeEndHour }}:00 自动切换
        </p>
      </div>
      <button
        class="w-12 h-6 rounded-full transition-all relative focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        :class="config.autoNightMode ? 'bg-primary' : 'bg-muted'"
        :aria-label="config.autoNightMode ? '关闭自动夜间模式' : '开启自动夜间模式'"
        :aria-checked="config.autoNightMode"
        role="switch"
        @click="emit('toggle-auto-night-mode')"
      >
        <span
          class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
          :class="config.autoNightMode ? 'left-6' : 'left-0.5'"
        />
      </button>
    </div>
  </section>
</template>
