import { computed } from 'vue'
import type {
  ReaderToolbarTopBarBindingResult,
  ReaderToolbarTopBarContentBindings,
} from './toolbar-top-bar-binding-types'
import type { ReaderToolbarTopBarEmitFn } from './toolbar-top-bar-emit-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export function createReaderToolbarTopBarBindings(
  props: ReaderToolbarTopBarProps,
  emit: ReaderToolbarTopBarEmitFn
): ReaderToolbarTopBarBindingResult {
  const contentBindings = computed<ReaderToolbarTopBarContentBindings>(() => ({
    ...props,
    onBack: () => emit('back'),
    onToggleCatalog: () => emit('toggleCatalog'),
    onToggleFullscreen: () => emit('toggleFullscreen'),
  }))

  const isVisible = computed(() => props.show && !props.zenMode)

  return {
    contentBindings,
    isVisible,
  }
}
