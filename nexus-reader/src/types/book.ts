export interface Book {
  id?: string
  sourceId: string
  bookUrl: string
  name: string
  author: string
  coverUrl?: string
  intro?: string
  tocUrl?: string
  lastChapterIndex?: number
  lastReadPosition?: number
  lastReadTime?: number
  createdAt?: number
  sourceName?: string
  origin?: string
  originName?: string
  type?: string
  durChapterIndex?: number
  durChapterTitle?: string
  latestChapterTitle?: string
  totalChapterNum?: number
  groupId?: string
}

export interface Chapter {
  title: string
  url: string
  index: number
  isVip?: boolean
}

export interface ChapterContent {
  content: string
  chunks?: string[]
  meta?: {
    quality?: {
      score: number
      label: string
      charCount: number
      paragraphCount: number
      noiseRatio: number
      duplicateRatio: number
      reasons: string[]
    }
    strategyPath?: string[]
    stageReports?: Array<{
      stage: string
      ok: boolean
      strategy?: string
      failureCode?: string
      warnings?: string[]
      metrics?: Record<string, string>
    }>
  }
}
