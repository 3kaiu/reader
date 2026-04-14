import { computed } from 'vue'

export interface ReaderProgressProps {
  progress: number
}

export function createReaderProgressViewBindings(
  props: ReaderProgressProps
) {
  return {
    fillStyle: computed(() => ({
      width: `${props.progress}%`,
    })),
  }
}
