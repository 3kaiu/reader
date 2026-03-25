import type { ReaderViewServices } from './view-dependencies'

export function createReaderChromeFeatureOptions(
  services: ReaderViewServices,
) {
  return {
    settingsStore: services.settingsStore,
    decoderStore: services.decoderStore,
    decoderAddonEnabled: services.decoderAddonEnabled,
    toast: services.toast,
  }
}
