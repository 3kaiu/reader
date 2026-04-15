import { computed } from 'vue'

export interface ReaderFullscreenTimeProps {
  formattedTime: string
}

export function createReaderFullscreenTimeViewBindings(
  props: ReaderFullscreenTimeProps
) {
  return {
    displayTime: computed(() => props.formattedTime),
  }
}
