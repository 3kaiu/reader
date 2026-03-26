import { computed } from 'vue'
import type {
  ReaderToolbarZenButtonProps,
} from './toolbar-zen-button-prop-types'
import type { ReaderToolbarProps } from './toolbar-prop-types'

export function createReaderToolbarZenButtonBindings(
  props: Pick<ReaderToolbarProps, 'zenMode'>,
) {
  return computed<ReaderToolbarZenButtonProps>(() => ({
    zenMode: props.zenMode,
  }))
}
