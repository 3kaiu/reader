import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderContentViewportEmits } from './reader-content-viewport-emit-types'
import type { ReaderContentViewportProps } from './reader-content-viewport-prop-types'
import type { ReaderFullscreenTimeProps } from './reader-fullscreen-time-view-bindings'

type ReaderContentViewportEmitFn = <EventName extends keyof ReaderContentViewportEmits>(
  event: EventName,
  ...args: ReaderContentViewportEmits[EventName]
) => void

export interface ReaderContentViewportViewBindings {
  showFullscreenTime: ComputedRef<boolean>
  fullscreenTimeProps: ComputedRef<ReaderFullscreenTimeProps>
  onLoadNextChapter: () => void
  onRetryLoad: () => void
}

export function createReaderContentViewportViewBindings(
  props: ReaderContentViewportProps,
  emit: ReaderContentViewportEmitFn
): ReaderContentViewportViewBindings {
  return {
    showFullscreenTime: computed(() => props.isFullscreen),
    fullscreenTimeProps: computed<ReaderFullscreenTimeProps>(() => ({
      formattedTime: props.formattedTime,
    })),
    onLoadNextChapter: () => emit('loadNextChapter'),
    onRetryLoad: () => emit('retryLoad'),
  }
}
