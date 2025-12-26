<script setup lang="ts">
/**
 * 内容问题警告横幅组件
 */
import { ArrowLeftRight } from 'lucide-vue-next'

const props = defineProps<{
  message: string
  show: boolean
}>()

const emit = defineEmits<{
  'change-source': []
}>()
</script>

<template>
  <Transition name="slide-down">
    <div
      v-if="message && show"
      class="fixed top-0 inset-x-0 z-30"
    >
      <div class="mx-3 mt-3 px-4 py-3 rounded-2xl bg-amber-500/95 dark:bg-amber-600/95 text-white shadow-lg backdrop-blur">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <svg
              class="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span class="text-sm font-medium truncate">{{ message }}</span>
          </div>
          <button
            class="shrink-0 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5"
            @click="emit('change-source')"
          >
            <ArrowLeftRight class="w-3.5 h-3.5" />
            换源
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-100%);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
