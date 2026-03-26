import { computed } from 'vue'
import type {
  ReaderToolbarActionButtonEmitFn,
} from './reader-toolbar-action-button-emit-types'
import type {
  ReaderToolbarActionButtonProps,
} from './reader-toolbar-action-button-prop-types'
import type {
  ReaderToolbarActionButtonViewBindings,
} from './reader-toolbar-action-button-view-binding-types'

export function createReaderToolbarActionButtonViewBindings(
  props: ReaderToolbarActionButtonProps,
  emit: ReaderToolbarActionButtonEmitFn,
): ReaderToolbarActionButtonViewBindings {
  const buttonClass = computed(() =>
    props.isActive ? props.activeClass ?? '' : '',
  )

  return {
    buttonClass,
    onClick: () => emit('click'),
    onContextmenu: (event: MouseEvent) => emit('contextmenu', event),
  }
}
