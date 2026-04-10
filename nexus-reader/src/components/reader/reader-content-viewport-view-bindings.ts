import { computed } from 'vue'
import type { ReaderContentViewportEmits } from './reader-content-viewport-emit-types'
import type { ReaderContentViewportProps } from './reader-content-viewport-prop-types'
import type { ReaderContentViewportViewBindings } from './reader-content-viewport-view-binding-types'
import type { ReaderFullscreenTimeProps } from './reader-fullscreen-time-prop-types'

type ReaderContentViewportEmitFn = <EventName extends keyof ReaderContentViewportEmits>(
  event: EventName,
  ...args: ReaderContentViewportEmits[EventName]
) => void

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
