import { computed } from 'vue'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderBookInfoModalBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn,
) {
  return computed(() => ({
    open: props.showBookInfo,
    bookUrl: props.book?.bookUrl,
    initialBook: props.book,
    'onUpdate:open': (value: boolean) => emit('update:showBookInfo', value),
  }))
}
