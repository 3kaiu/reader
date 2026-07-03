import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderExperienceModelHandlerOptions } from '@/composables/reader/experience-types'
import type { ReaderExperienceServiceState } from '@/composables/reader/experience-state-service-types'
import type { ReaderContentProps } from './reader-content-prop-types'

export function createReaderExperienceContentBindings(
  state: Pick<ReaderExperienceServiceState, 'readerStore'>,
  _actions: ReaderExperienceModelHandlerOptions,
  contentProps: ComputedRef<ReaderContentProps>
) {
  return computed(() => ({
    ...contentProps.value,
    onLoadNextChapter: state.readerStore.appendNextChapter,
    onRetryLoad: state.readerStore.retryLoadNext,
  }))
}
