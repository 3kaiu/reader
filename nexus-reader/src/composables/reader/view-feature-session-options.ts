import type { ReaderViewServices } from './view-dependencies'

export function createReaderSessionFeatureOptions(
  services: ReaderViewServices,
) {
  return {
    toast: services.toast,
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    offlineStore: services.offlineStore,
    decoderStore: services.decoderStore,
    decoderAddonEnabled: services.decoderAddonEnabled,
  }
}
