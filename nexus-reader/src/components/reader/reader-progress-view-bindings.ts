import { computed } from 'vue'
import type { ReaderProgressProps } from './reader-progress-prop-types'
import type { ReaderProgressViewBindings } from './reader-progress-view-binding-types'

export function createReaderProgressViewBindings(
  props: ReaderProgressProps
): ReaderProgressViewBindings {
  return {
    fillStyle: computed(() => ({
      width: `${props.progress}%`,
    })),
  }
}
