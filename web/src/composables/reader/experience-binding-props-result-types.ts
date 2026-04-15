import type { createReaderExperienceContentProps } from './experience-content'
import type { createReaderExperienceModalProps } from './experience-modal'
import type { createReaderExperienceToolbarProps } from './experience-toolbar'

export interface ReaderExperienceBindingPropsResult {
  toolbarProps: ReturnType<typeof createReaderExperienceToolbarProps>
  contentProps: ReturnType<typeof createReaderExperienceContentProps>
  modalProps: ReturnType<typeof createReaderExperienceModalProps>
}
