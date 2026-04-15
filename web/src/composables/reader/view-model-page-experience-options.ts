import type {
  ReaderPageExperienceActions,
  ReaderPageModelExperienceOptions,
} from './page-model-experience-options'

export function createReaderViewPageExperienceOptions(
  readerExperienceActions: ReaderPageExperienceActions
): ReaderPageModelExperienceOptions {
  return {
    readerExperienceActions,
  }
}
