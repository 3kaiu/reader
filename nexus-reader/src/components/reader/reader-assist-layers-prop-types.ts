import type {
  ReaderAssistActions,
  ReaderAssistState,
} from '@/composables/reader/experience-assist-types'

export interface ReaderAssistLayersProps {
  state: ReaderAssistState
  actions: ReaderAssistActions
}
