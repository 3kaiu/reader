<script setup lang="ts">
/**
 * 👁️ 休息提醒弹窗组件
 */
import { Coffee, X, RotateCcw } from 'lucide-vue-next'

defineProps<{
  readingTime: string
  visible: boolean
}>()

const emit = defineEmits<{
  dismiss: []
  takeBreak: []
}>()
</script>

<template>
  <Transition name="fade">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div class="mx-4 w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-2xl">
        <!-- 图标 -->
        <div class="mb-4 flex justify-center">
          <div class="rounded-full bg-amber-100 dark:bg-amber-900 p-4">
            <Coffee class="h-10 w-10 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        <!-- 标题 -->
        <h3 class="mb-2 text-center text-lg font-semibold">该休息一下了</h3>

        <!-- 描述 -->
        <p class="mb-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          您已连续阅读 <span class="font-medium text-amber-600">{{ readingTime }}</span>
          <br />
          让眼睛休息一下，看看远处吧
        </p>

        <!-- 按钮 -->
        <div class="flex gap-3">
          <button
            class="flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 py-3 px-4 text-sm font-medium transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
            @click="emit('dismiss')"
          >
            <X class="mr-1 inline-block h-4 w-4" />
            继续阅读
          </button>
          <button
            class="flex-1 rounded-xl bg-amber-500 py-3 px-4 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            @click="emit('takeBreak')"
          >
            <RotateCcw class="mr-1 inline-block h-4 w-4" />
            休息一下
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
