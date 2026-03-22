import { Building2, Calendar, MapPin, User, Users } from 'lucide-vue-next'
import type { DictionaryLevel, EntityCategory } from '@/types/decoder'

type DecoderCategoryIcon = typeof User

export const DECODER_CATEGORY_CONFIG: Record<
  EntityCategory,
  {
    icon: DecoderCategoryIcon
    label: string
  }
> = {
  person: {
    icon: User,
    label: '人物',
  },
  company: {
    icon: Building2,
    label: '公司',
  },
  place: {
    icon: MapPin,
    label: '地点',
  },
  event: {
    icon: Calendar,
    label: '事件',
  },
  organization: {
    icon: Users,
    label: '组织',
  },
}

export const DECODER_LEVEL_CONFIG: Record<
  DictionaryLevel,
  {
    label: string
    color: string
  }
> = {
  global: {
    label: '公共',
    color: 'bg-blue-500/10 text-blue-600',
  },
  category: {
    label: '分类',
    color: 'bg-purple-500/10 text-purple-600',
  },
  book: {
    label: '书籍',
    color: 'bg-green-500/10 text-green-600',
  },
}

export const DECODER_CATEGORY_OPTIONS = [
  { value: 'person', label: '人物' },
  { value: 'company', label: '公司' },
  { value: 'place', label: '地点' },
  { value: 'event', label: '事件' },
  { value: 'organization', label: '组织' },
] as const satisfies ReadonlyArray<{
  value: EntityCategory
  label: string
}>

export const DECODER_LEVEL_OPTIONS = [
  { value: 'global', label: '公共词典' },
  { value: 'category', label: '分类词典' },
  { value: 'book', label: '书籍词典' },
] as const satisfies ReadonlyArray<{
  value: DictionaryLevel
  label: string
}>
