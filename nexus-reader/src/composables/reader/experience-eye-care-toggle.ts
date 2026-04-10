import type { ReaderExperienceServiceState } from './experience-state-service-types'

export function createReaderEyeCareToggleHandler(
  state: Pick<ReaderExperienceServiceState, 'eyeCare'>
) {
  return function handleToggleEyeCare() {
    if (state.eyeCare.config.value.enabled) {
      state.eyeCare.disable()
      return
    }

    state.eyeCare.enable()
  }
}
