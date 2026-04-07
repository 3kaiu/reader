<script setup lang="ts">
import {
  createReaderErrorStateViewBindings,
} from './reader-error-state-view-bindings'
import type { ReaderErrorStateEmits } from './reader-error-state-emit-types'
import type { ReaderErrorStateEmitFn } from './reader-error-state-emit-types'
import type { ReaderErrorStateProps } from './reader-error-state-prop-types'

const props = defineProps<ReaderErrorStateProps>()
const emit = defineEmits<ReaderErrorStateEmits>()
const {
  errorMessage,
  errorDetails,
  onOpenSourcePicker,
  onRetryLoad,
} = createReaderErrorStateViewBindings(
  props,
  emit as unknown as ReaderErrorStateEmitFn,
)
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 z-40 relative">
    <div class="text-center max-w-sm">
      <h2 class="text-lg font-semibold mb-2">加载失败</h2>
      <p class="text-sm opacity-60">{{ errorMessage }}</p>
      <p v-if="errorDetails" class="text-xs mt-2 opacity-50 break-words">
        {{ errorDetails }}
      </p>
      <div class="mt-6 grid grid-cols-2 gap-3">
        <button
          class="w-full py-3 px-4 rounded-xl bg-primary/10 hover:bg-primary/20"
          @click="onRetryLoad"
        >
          重试加载
        </button>
        <button
          class="w-full py-3 px-4 rounded-xl bg-primary/10 hover:bg-primary/20"
          @click="onOpenSourcePicker"
        >
          查看书源
        </button>
      </div>
    </div>
  </div>
</template>
