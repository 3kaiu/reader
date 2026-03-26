import type { ReaderAssistActions } from './experience-assist-types'
import type {
  ReaderExperienceDecoderActions,
} from './experience-decoder-action-types'
import type {
  ReaderExperienceModalActions,
} from './experience-modal-action-types'

type ReaderExperienceAssistActionShape =
  Pick<ReaderExperienceModalActions, 'setShowDecoderSettings'> &
  Pick<
    ReaderExperienceDecoderActions,
    'decodeCurrentChapter' | 'handleConfirmEntity' | 'handleCorrectEntity'
  >

export function createReaderExperienceAssistActions(
  actions: ReaderExperienceAssistActionShape,
): ReaderAssistActions {
  return {
    setShowDecoderSettings: actions.setShowDecoderSettings,
    decodeCurrentChapter: actions.decodeCurrentChapter,
    handleConfirmEntity: actions.handleConfirmEntity,
    handleCorrectEntity: actions.handleCorrectEntity,
  }
}
