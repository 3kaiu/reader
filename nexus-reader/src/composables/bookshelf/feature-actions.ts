import type { OptionalFeature } from '@/utils/features'
import type { BookshelfActionsOptions } from './types'

export function createBookshelfFeatureActions(options: BookshelfActionsOptions) {
  function isFeatureEnabled(feature: OptionalFeature) {
    return options.addonsStore.features[feature]
  }

  return {
    isFeatureEnabled,
  }
}
