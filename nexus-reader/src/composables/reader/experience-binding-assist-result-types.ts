import type {
  createReaderExperienceAssistActions,
  createReaderExperienceAssistState,
} from './experience-assist'

export interface ReaderExperienceBindingAssistResult {
  assistState: ReturnType<typeof createReaderExperienceAssistState>
  assistActions: ReturnType<typeof createReaderExperienceAssistActions>
  handleToggleEyeCare: () => void
}
