import type {
  ReaderExperienceActions,
} from './experience-action-types'
import type { ReaderExperienceState } from './experience-state-types'
import {
  createReaderExperienceAssistActions,
  createReaderExperienceAssistState,
  createReaderEyeCareToggleHandler,
} from './experience-assist'
import { createReaderExperienceContentProps } from './experience-content'
import { createReaderExperienceModalProps } from './experience-modal'
import { createReaderExperienceToolbarProps } from './experience-toolbar'

export type ReaderExperienceProps = {
  state: ReaderExperienceState
  actions: ReaderExperienceActions
}

export function createReaderExperienceBindings(
  props: ReaderExperienceProps,
) {
  const toolbarProps = createReaderExperienceToolbarProps(props.state)
  const contentProps = createReaderExperienceContentProps(props.state)
  const modalProps = createReaderExperienceModalProps(props.state)
  const assistState = createReaderExperienceAssistState(props.state)
  const assistActions = createReaderExperienceAssistActions(props.actions)
  const handleToggleEyeCare = createReaderEyeCareToggleHandler(props.state)

  return {
    toolbarProps,
    contentProps,
    modalProps,
    assistState,
    assistActions,
    handleToggleEyeCare,
  }
}
