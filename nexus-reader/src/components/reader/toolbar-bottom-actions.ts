import { computed } from 'vue'
import { createReaderToolbarBottomDecoderAction } from './toolbar-bottom-decoder-action'
import { createReaderToolbarBottomStaticActions } from './toolbar-bottom-static-actions'
import type {
  ReaderToolbarBottomAction,
  ReaderToolbarBottomActionsEmitFn,
  ReaderToolbarBottomActionsProps,
} from './toolbar-bottom-action-types'

export type {
  ReaderToolbarBottomActionsEmits,
  ReaderToolbarBottomActionsProps,
} from './toolbar-bottom-action-types'

export function createReaderToolbarBottomActions(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn,
) {
  const actionButtons = computed<ReaderToolbarBottomAction[]>(() => {
    const { primaryActions, trailingActions } =
      createReaderToolbarBottomStaticActions(props, emit)
    const decoderAction = createReaderToolbarBottomDecoderAction(props, emit)

    return decoderAction
      ? [...primaryActions, decoderAction, ...trailingActions]
      : [...primaryActions, ...trailingActions]
  })

  return {
    actionButtons,
  }
}
