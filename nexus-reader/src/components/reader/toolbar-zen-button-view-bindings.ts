import { computed } from 'vue'
import type {
  ReaderToolbarZenButtonEmitFn,
} from './toolbar-zen-button-emit-types'
import type {
  ReaderToolbarZenButtonProps,
} from './toolbar-zen-button-prop-types'
import type {
  ReaderToolbarZenButtonViewBindings,
} from './toolbar-zen-button-view-binding-types'

export function createReaderToolbarZenButtonViewBindings(
  props: ReaderToolbarZenButtonProps,
  emit: ReaderToolbarZenButtonEmitFn,
): ReaderToolbarZenButtonViewBindings {
  return {
    isVisible: computed(() => props.zenMode),
    onExit: () => emit('exit'),
  }
}
