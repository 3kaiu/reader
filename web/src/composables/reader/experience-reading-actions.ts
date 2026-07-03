import type { ReaderExperienceReadingActions } from './experience-types'
import type { ReaderExperienceModelHandlerOptions } from './experience-types'

type ReaderExperienceReadingActionOptions = Pick<
  ReaderExperienceModelHandlerOptions,
  'handleRefresh' | 'handlePrevChapter' | 'handleNextChapter' | 'handleSelectChapter'
>

export function createReaderExperienceReadingActions(
  options: ReaderExperienceReadingActionOptions
): ReaderExperienceReadingActions {
  return {
    handleRefresh: options.handleRefresh,
    handlePrevChapter: options.handlePrevChapter,
    handleNextChapter: options.handleNextChapter,
    handleSelectChapter: options.handleSelectChapter,
  }
}
