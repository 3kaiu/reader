import { config } from './config'

const optionalFeatureKeys = ['discovery'] as const

export type OptionalFeature = (typeof optionalFeatureKeys)[number]

const featureConfigKeys: Record<OptionalFeature, string> = {
  discovery: 'features.discovery',
}

export function isOptionalFeature(feature: string): feature is OptionalFeature {
  return (optionalFeatureKeys as readonly string[]).includes(feature)
}

export function isOptionalFeatureEnabled(feature: OptionalFeature): boolean {
  return Boolean(config.get(featureConfigKeys[feature], false))
}

export function setOptionalFeatureEnabled(feature: OptionalFeature, enabled: boolean): void {
  config.set(featureConfigKeys[feature], enabled)
}

export function getOptionalFeatureState(): Record<OptionalFeature, boolean> {
  return {
    discovery: isOptionalFeatureEnabled('discovery'),
  }
}
