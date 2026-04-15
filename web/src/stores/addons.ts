import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getOptionalFeatureState,
  setOptionalFeatureEnabled,
  type OptionalFeature,
} from '@/utils/features'

type OptionalFeatureState = Record<OptionalFeature, boolean>

export const useAddonsStore = defineStore('addons', () => {
  const features = ref<OptionalFeatureState>(getOptionalFeatureState())

  const enabledFeatures = computed(() =>
    Object.entries(features.value)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature as OptionalFeature)
  )

  function refresh(): void {
    features.value = getOptionalFeatureState()
  }

  function isEnabled(feature: OptionalFeature): boolean {
    return features.value[feature]
  }

  function setFeatureEnabled(feature: OptionalFeature, enabled: boolean): void {
    features.value = {
      ...features.value,
      [feature]: enabled,
    }
    setOptionalFeatureEnabled(feature, enabled)
  }

  return {
    features,
    enabledFeatures,
    refresh,
    isEnabled,
    setFeatureEnabled,
  }
})
