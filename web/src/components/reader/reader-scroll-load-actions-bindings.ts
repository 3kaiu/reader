import { computed } from 'vue'
import type { ReaderScrollLoadActionsProps } from './reader-scroll-load-actions-prop-types'

export function createReaderScrollLoadActionsBindings(props: ReaderScrollLoadActionsProps) {
  const hasLoadError = computed(() => Boolean(props.loadError))

  return {
    hasLoadError,
  }
}
