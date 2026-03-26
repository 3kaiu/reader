import { computed } from 'vue'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'
import { createReaderToolbarBottomActionList } from './toolbar-bottom-action-list'

export type {
  ReaderToolbarBottomActionsEmits,
} from './toolbar-bottom-action-emit-types'
export type {
  ReaderToolbarBottomActionsProps,
} from './toolbar-bottom-action-prop-types'

export function createReaderToolbarBottomActions(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn,
) {
  const actionButtons = computed<ReaderToolbarBottomAction[]>(() =>
    createReaderToolbarBottomActionList(props, emit),
  )

  return {
    actionButtons,
  }
}
