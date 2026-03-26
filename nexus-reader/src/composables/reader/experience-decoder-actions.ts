import type {
  ReaderExperienceDecoderActions,
} from './experience-decoder-action-types'
import type {
  ReaderExperienceModelHandlerOptions,
} from './experience-model-handler-types'

type ReaderExperienceDecoderActionOptions =
  Pick<
    ReaderExperienceModelHandlerOptions,
    | 'handleToggleDecoder'
    | 'decodeCurrentChapter'
    | 'handleEntityClick'
    | 'handleConfirmEntity'
    | 'handleCorrectEntity'
  >

export function createReaderExperienceDecoderActions(
  options: ReaderExperienceDecoderActionOptions,
): ReaderExperienceDecoderActions {
  return {
    handleToggleDecoder: options.handleToggleDecoder,
    decodeCurrentChapter: options.decodeCurrentChapter,
    handleEntityClick: options.handleEntityClick,
    handleConfirmEntity: options.handleConfirmEntity,
    handleCorrectEntity: options.handleCorrectEntity,
  }
}
