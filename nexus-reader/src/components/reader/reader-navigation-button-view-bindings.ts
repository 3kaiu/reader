import { computed } from 'vue'
import type {
  ReaderNavigationButtonEmitFn,
} from './reader-navigation-button-emit-types'
import type { ReaderNavigationButtonProps } from './reader-navigation-button-prop-types'
import type {
  ReaderNavigationButtonViewBindings,
} from './reader-navigation-button-view-binding-types'

export function createReaderNavigationButtonViewBindings(
  props: ReaderNavigationButtonProps,
  emit: ReaderNavigationButtonEmitFn,
): ReaderNavigationButtonViewBindings {
  const buttonClass = computed(() => ({
    disabled: props.disabled,
  }))

  return {
    buttonClass,
    onClick: () => emit('click'),
  }
}
