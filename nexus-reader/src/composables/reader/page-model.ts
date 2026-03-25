import { createReaderPageActions } from './page-actions'
import { createReaderPageState } from './page-state'
import type { ReaderPageModelOptions } from './page-model-types'

export type { ReaderPageModelOptions } from './page-model-types'

export function createReaderPageModel(options: ReaderPageModelOptions) {
  const readerPageState = createReaderPageState(options)
  const readerPageActions = createReaderPageActions(options)

  return {
    readerPageState,
    readerPageActions,
  }
}
