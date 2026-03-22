import { AlertCircle, Building2, MapPin, User } from 'lucide-vue-next'

type AiMappingIcon = typeof User

export const AI_MAPPING_TYPE_CONFIG: Record<
  string,
  {
    icon: AiMappingIcon
    label: string
    color: string
  }
> = {
  person: {
    icon: User,
    label: '人物',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  company: {
    icon: Building2,
    label: '公司',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  department: {
    icon: Building2,
    label: '部门',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  location: {
    icon: MapPin,
    label: '地点',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  other: {
    icon: AlertCircle,
    label: '其他',
    color: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  },
}

export const AI_MAPPING_FILTER_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'person', label: '人物' },
  { value: 'company', label: '公司' },
  { value: 'department', label: '部门' },
  { value: 'location', label: '地点' },
  { value: 'other', label: '其他' },
] as const
