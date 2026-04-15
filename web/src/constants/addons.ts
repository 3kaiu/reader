import { Compass } from 'lucide-vue-next'
import type { OptionalFeature } from '@/utils/features'

type AddonIcon = typeof Compass

export type AddonToggleDefinition = {
  key: OptionalFeature
  label: string
  description: string
  icon: AddonIcon
  color: string
  bg: string
}

export type AddonRouteEntry = {
  feature: OptionalFeature
  label: string
  description: string
  icon: AddonIcon
  path: string
  color: string
  bg: string
}

export const ADDON_FEATURE_TOGGLES: AddonToggleDefinition[] = [
  {
    key: 'discovery',
    label: '探索发现',
    description: '发现页与阅读周报改为可选模块',
    icon: Compass,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
]

export const ADDON_ENTRY_CARDS: AddonRouteEntry[] = [
  {
    feature: 'discovery',
    label: '探索发现',
    description: '发现新书与阅读周报',
    icon: Compass,
    path: '/discovery',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
]

export const ADDON_MENU_ENTRIES: AddonRouteEntry[] = [ADDON_ENTRY_CARDS[0]]
