export interface BookSource {
  id: string
  name: string
  url?: string
  enabled: boolean
  version?: number | string
  origin?: string
  originName?: string
  bookUrl?: string
  coverUrl?: string
  latestChapterTitle?: string
  time?: number
  type?: string
  bookSourceGroup?: string
}
