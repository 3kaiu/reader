import { useReaderSession } from '@/composables/useReaderSession'
import { useReaderChrome } from '@/composables/useReaderChrome'
import { useReaderActions } from '@/composables/useReaderActions'
import { setupReaderViewFeatureEffects } from './view-feature-effects'
import type { ReaderViewFeatures } from './view-model-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderViewServices } from './view-services'

export type { ReaderViewFeatures } from './view-model-types'

function createReaderViewSessionFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout
): ReaderViewFeatures['session'] {
  return useReaderSession({
    toast: services.toast,
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    offlineStore: services.offlineStore,
  })
}

function createReaderViewChromeFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout
): ReaderViewFeatures['chrome'] {
  return useReaderChrome({
    settingsStore: services.settingsStore,
    toast: services.toast,
  })
}

function createReaderViewActionFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout
): ReaderViewFeatures['actions'] {
  return useReaderActions({
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    toast: services.toast,
  })
}

export function createReaderViewFeatures(
  services: ReaderViewServices,
  layout: ReaderViewLayout
): ReaderViewFeatures {
  const session = createReaderViewSessionFeature(services, layout)
  const chrome = createReaderViewChromeFeature(services, layout)
  const actions = createReaderViewActionFeature(services, layout)

  setupReaderViewFeatureEffects(services)

  return { session, chrome, actions }
}