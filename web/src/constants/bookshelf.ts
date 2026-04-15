import { Server, Settings, Wrench } from 'lucide-vue-next'
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
  _isFeatureEnabled: (feature: OptionalFeature) => boolean
): BookshelfMenuGroup[] {
  return [
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
          label: '书源工厂',
          desc: '封装、验证和自动修正规则包',
          icon: Wrench,
          path: '/source-builder-debug',
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
        },
      ],
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
