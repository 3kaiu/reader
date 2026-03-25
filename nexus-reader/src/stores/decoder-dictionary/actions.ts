import { createDecoderDictionaryEntryActions } from './actions/entries'
import { createDecoderDictionaryActionHelpers } from './actions/helpers'
import { createDecoderDictionaryLoadingActions } from './actions/loading'
import { createDecoderDictionaryTransferActions } from './actions/transfer'
import type {
  DecoderDictionaryStoreActions,
  DecoderDictionaryStoreState,
} from './types'

export function createDecoderDictionaryStoreActions(
  state: DecoderDictionaryStoreState
): DecoderDictionaryStoreActions {
  const helperActions = createDecoderDictionaryActionHelpers(state)
  const loadingActions = createDecoderDictionaryLoadingActions(state, {
    applyEntries: helperActions.applyEntries,
  })
  const entryActions = createDecoderDictionaryEntryActions({
    entries: () => state.entries.value,
    applyEntries: helperActions.applyEntries,
  })
  const transferActions = createDecoderDictionaryTransferActions({
    loadEntries: loadingActions.loadEntries,
  })

  return {
    ...loadingActions,
    ...entryActions,
    ...transferActions,
  }
}
