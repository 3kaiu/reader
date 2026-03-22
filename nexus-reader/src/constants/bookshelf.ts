import { Server, Settings, Wand2 } from 'lucide-vue-next'
import { ADDON_MENU_ENTRIES } from '@/constants/addons'
import type { OptionalFeature } from '@/utils/features'

export type BookshelfMenuItem = {
  label: string
  desc: string
  icon: typeof Server
  path: string
  color: string
  bg: string
}

export type BookshelfMenuGroup = {
  title: string
  items: BookshelfMenuItem[]
}

export function buildBookshelfMenuGroups(
  isFeatureEnabled: (feature: OptionalFeature) => boolean
): BookshelfMenuGroup[] {
  return [
    {
      title: '发现',
      items: ADDON_MENU_ENTRIES.filter(
        item => item.feature === 'discovery' && isFeatureEnabled(item.feature)
      ).map(item => ({
        label: item.label,
        desc: item.description,
        icon: item.icon,
        path: item.path,
        color: item.color,
        bg: item.bg,
      })),
    },
    {
      title: '内容管理',
      items: [
        {
          label: '书源管理',
          desc: '管理接入的书源站点',
          icon: Server,
          path: '/sources',
          color: 'text-blue-500',
          bg: 'bg-blue-500/10',
        },
        {
          label: '替换规则',
          desc: '净化与替换文本内容',
          icon: Wand2,
          path: '/replace-rule',
          color: 'text-purple-500',
          bg: 'bg-purple-500/10',
        },
      ],
    },
    {
      title: '附属模块',
      items: ADDON_MENU_ENTRIES.filter(
        item => item.feature === 'ai' && isFeatureEnabled(item.feature)
      ).map(item => ({
        label: item.label,
        desc: item.description,
        icon: item.icon,
        path: item.path,
        color: item.color,
        bg: item.bg,
      })),
    },
    {
      title: '系统',
      items: [
        {
          label: '系统设置',
          desc: '偏好与通用设置',
          icon: Settings,
          path: '/settings',
          color: 'text-slate-500',
          bg: 'bg-slate-500/10',
        },
      ],
    },
  ].filter(group => group.items.length > 0)
}
