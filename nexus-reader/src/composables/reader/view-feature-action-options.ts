import type { ReaderViewServices } from './view-dependencies'

export function createReaderActionFeatureOptions(services: ReaderViewServices) {
  return {
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    toast: services.toast,
  }
}
