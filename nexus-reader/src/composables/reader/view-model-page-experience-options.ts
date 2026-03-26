import type {
  ReaderPageExperienceActions,
  ReaderPageModelExperienceOptions,
} from './page-model-experience-options'

export function createReaderPageModelExperienceOptions(
  readerExperienceActions: ReaderPageExperienceActions,
): ReaderPageModelExperienceOptions {
  return {
    readerExperienceActions,
  }
}
