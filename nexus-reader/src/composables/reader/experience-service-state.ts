import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceServiceState } from './experience-state-service-types'

export function createReaderExperienceServiceState(
  options: ReaderExperienceModelServiceOptions
): ReaderExperienceServiceState {
  return {
    readerStore: options.readerStore,
    settingsStore: options.settingsStore,
    eyeCare: options.eyeCare,
    activeBookUrl: options.activeBookUrl.value,
  }
}
