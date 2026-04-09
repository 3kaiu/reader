<script setup lang="ts">
import { ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import ReaderScrollFinishedState from './ReaderScrollFinishedState.vue'
import ReaderScrollLoadActions from './ReaderScrollLoadActions.vue'
import ReaderScrollLoadingState from './ReaderScrollLoadingState.vue'
import { createReaderScrollLoadStateBindings } from './reader-scroll-load-state-bindings'
import {
  createReaderScrollLoadStateViewBindings,
} from './reader-scroll-load-state-view-bindings'
import type {
  ReaderScrollLoadStateEmits,
} from './reader-scroll-load-state-emit-types'
import type {
  ReaderScrollLoadStateProps,
} from './reader-scroll-load-state-prop-types'

const props = defineProps<ReaderScrollLoadStateProps>()
const emit = defineEmits<ReaderScrollLoadStateEmits>()

const {
  showInitialParsing,
  showLoadingMore,
  showFinished,
  showLoadActions,
} = createReaderScrollLoadStateBindings(props)
const {
  initialLoadingProps,
  loadingMoreProps,
  loadActionsBindings,
} = createReaderScrollLoadStateViewBindings(props, emit)
const rootRef = ref<HTMLElement | null>(null)

useIntersectionObserver(
  rootRef,
  ([{ isIntersecting }]) => {
    // 只有在屏幕底部的等待加载视图出现时，且没有发生错误，才自动加载下一章
    if (
      isIntersecting &&
      !props.isLoadingMore &&
      !props.loadError &&
      props.hasNextChapter
    ) {
      emit('loadNextChapter')
    }
  },
  {
    rootMargin: '200px', // 提前 200px 触发
  }
)
</script>

<template>
  <div ref="rootRef" class="w-full">
    <ReaderScrollLoadingState
      v-if="showInitialParsing"
      v-bind="initialLoadingProps"
    />

  <ReaderScrollLoadingState
    v-else-if="showLoadingMore"
    v-bind="loadingMoreProps"
  />

  <ReaderScrollFinishedState v-else-if="showFinished" />

  <ReaderScrollLoadActions
    v-else-if="showLoadActions"
    v-bind="loadActionsBindings"
  />
  </div>
</template>
