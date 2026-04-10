import type { ReaderExperienceActions } from './experience-action-contract-types'
import { createReaderExperienceState } from './experience-state'
import type { ReaderPageActions } from './page-action-types'
import { createReaderPageState } from './page-state'

export interface ReaderViewModelResult {
  readerPageState: ReturnType<typeof createReaderPageState>
  readerPageActions: ReaderPageActions
  readerExperienceState: ReturnType<typeof createReaderExperienceState>
  readerExperienceActions: ReaderExperienceActions
}
