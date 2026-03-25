import type { Ref } from 'vue'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'

export function createReaderDecoderFeatureOptions(
  services: ReaderViewServices,
  session: {
    activeBookUrl: Readonly<Ref<string>>
  },
  _layout: ReaderViewLayout,
) {
  return {
    activeBookUrl: session.activeBookUrl,
    enabled: services.decoderAddonEnabled,
  }
}
