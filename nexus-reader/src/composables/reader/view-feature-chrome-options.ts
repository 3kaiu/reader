import type { ReaderViewServices } from './view-dependencies'

export function createReaderChromeFeatureOptions(services: ReaderViewServices) {
  return {
    settingsStore: services.settingsStore,
    toast: services.toast,
  }
}
