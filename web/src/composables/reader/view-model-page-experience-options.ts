import type {
  ReaderPageExperienceActions,
  ReaderPageModelExperienceOptions,
} from './page-model-types'

export function createReaderViewPageExperienceOptions(
  readerExperienceActions: ReaderPageExperienceActions
): ReaderPageModelExperienceOptions {
  return {
    readerExperienceActions,
  }
}
