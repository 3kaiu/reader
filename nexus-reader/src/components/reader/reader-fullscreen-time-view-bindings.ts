import { computed } from 'vue'
import type {
  ReaderFullscreenTimeProps,
} from './reader-fullscreen-time-prop-types'
import type {
  ReaderFullscreenTimeViewBindings,
} from './reader-fullscreen-time-view-binding-types'

export function createReaderFullscreenTimeViewBindings(
  props: ReaderFullscreenTimeProps,
): ReaderFullscreenTimeViewBindings {
  return {
    displayTime: computed(() => props.formattedTime),
  }
}
