import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderToolbarTopBarEmitFn } from './toolbar-top-bar-emit-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export interface ReaderToolbarTopBarContentBindings extends ReaderToolbarTopBarProps {
  onBack: () => void
  onToggleCatalog: () => void
  onToggleFullscreen: () => void
}

export interface ReaderToolbarTopBarBindingResult {
  contentBindings: ComputedRef<ReaderToolbarTopBarContentBindings>
  isVisible: ComputedRef<boolean>
}

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
