import { computed } from 'vue'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderSourcePickerModalBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn,
) {
  return computed(() => ({
    open: props.showSourcePicker,
    'onUpdate:open': (value: boolean) =>
      emit('update:showSourcePicker', value),
  }))
}
