import { Brain, Compass, Info } from 'lucide-vue-next'
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
  {
    key: 'ai',
    label: 'AI 助手',
    description: '本地 AI 运行时与映射规则改为可选模块',
    icon: Brain,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    key: 'decoder',
    label: '解密词典',
    description: '解码与词典管理改为可选模块',
    icon: Info,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
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
  {
    feature: 'decoder',
    label: '解密词典',
    description: '查看和编辑解密词典',
    icon: Info,
    path: '/decoder-dictionary',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    feature: 'ai',
    label: 'AI 模型',
    description: '实验性本地 AI 运行时管理',
    icon: Brain,
    path: '/ai-settings',
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
  {
    feature: 'ai',
    label: 'AI 映射规则',
    description: 'AI 映射规则与分析历史',
    icon: Brain,
    path: '/ai-analysis-settings',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
]

export const ADDON_MENU_ENTRIES: AddonRouteEntry[] = [
  ADDON_ENTRY_CARDS[0],
  ADDON_ENTRY_CARDS[2],
]
