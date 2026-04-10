import type { ReaderExperienceViewActions } from '@/composables/reader/experience-view-action-types'
import type { createReaderExperienceContentBindings } from './reader-experience-content-bindings'
import type { createReaderExperienceModalBindings } from './reader-experience-modal-bindings'
import type { createReaderExperienceToolbarBindings } from './reader-experience-toolbar-bindings'

export interface ReaderExperienceLayoutBindings {
  toolbarBindings: ReturnType<typeof createReaderExperienceToolbarBindings>
  contentBindings: ReturnType<typeof createReaderExperienceContentBindings>
  modalBindings: ReturnType<typeof createReaderExperienceModalBindings>
}

export interface ReaderExperienceLayoutBindingOptions extends ReaderExperienceLayoutBindings {
  contentRef: ReaderExperienceViewActions['bindContentRef']
}

export type ReaderExperienceLayoutProps = ReaderExperienceLayoutBindingOptions
