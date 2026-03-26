import { computed } from 'vue'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderSettingsModalBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn,
) {
  return computed(() => ({
    open: props.showSettings,
    'onUpdate:open': (value: boolean) => emit('update:showSettings', value),
  }))
}
