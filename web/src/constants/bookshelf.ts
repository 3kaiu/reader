import { Server, Settings, Wand2 } from 'lucide-vue-next'

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

export function buildBookshelfMenuGroups(): BookshelfMenuGroup[] {
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
          label: '替换规则',
          desc: '正文净化和规则替换',
          icon: Wand2,
          path: '/replace-rule',
          color: 'text-purple-500',
          bg: 'bg-purple-500/10',
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
