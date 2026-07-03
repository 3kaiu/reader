import { KEYBOARD_SHORTCUTS } from '@/constants/reader'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceDisplayState } from './experience-types'

type ReaderExperienceDisplayStateOptions = Pick<
  ReaderExperienceModelServiceOptions,
  'contentStyle' | 'isNightMode' | 'formattedTime'
>

export function createReaderExperienceDisplayState(
  options: ReaderExperienceDisplayStateOptions
): ReaderExperienceDisplayState {
  return {
    contentStyle: options.contentStyle.value,
    isNightMode: options.isNightMode.value,
    formattedTime: options.formattedTime.value,
    keyboardShortcuts: KEYBOARD_SHORTCUTS,
  }
}
