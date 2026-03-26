import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderContentProps } from './reader-content-prop-types'
import type {
  ReaderContentViewportProps,
} from './reader-content-viewport-prop-types'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

export function createReaderContentViewportBindings(
  props: ReaderContentProps,
  scrollContentProps: ComputedRef<ReaderScrollContentProps>,
) {
  return computed<ReaderContentViewportProps>(() => ({
    scrollContentProps: scrollContentProps.value,
    formattedTime: props.formattedTime,
    isFullscreen: props.isFullscreen,
  }))
}
