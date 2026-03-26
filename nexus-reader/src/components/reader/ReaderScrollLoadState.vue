<script setup lang="ts">
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
</script>

<template>
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
</template>
