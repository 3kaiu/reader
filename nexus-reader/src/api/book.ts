import { $get, $post, $delete, $patch, $put } from './client'

// 安全解码 URL，避免双重编码
// Vue Router hash 模式会自动编码查询参数，但 ofetch 的 params 也会编码
// 所以需要先解码，让 ofetch 重新编码
function safeDecodeUrl(url: string): string {
  try {
    // 如果 URL 包含编码字符（%），尝试解码
    if (url.includes('%')) {
      return decodeURIComponent(url)
    }
    return url
  } catch {
    // 解码失败，返回原始值
    return url
  }
}

// 书籍类型定义
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
  // 以下为前端兼容旧版可能需要的扩展字段
  durChapterTitle?: string
  latestChapterTitle?: string
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
}

export interface SearchResult {
  bookUrl: string
  name: string
  author?: string
  coverUrl?: string
  intro?: string
  sourceId: string
  sourceName: string
  latestChapter?: string
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
}

// 发现页类型定义
export interface DiscoveryItem {
  bookId: string
  name: string
  author?: string
  coverUrl?: string
  bookUrl: string
  intro?: string
  followers?: number
  position: number
}

export interface DiscoverySection {
  section: string // "carousel", "list", "image_list", "new_sign"
  items: DiscoveryItem[]
}

export interface DiscoveryResponse {
  period: string
  startDate: string
  endDate: string
  sections: DiscoverySection[]
  availablePeriods: string[]
}

// 书籍相关 API
export const bookApi = {
  // 获取书架
  getBookshelf: () =>
    $get<Book[]>('/bookshelf'),

  // 获取章节列表
  getChapterList: (source: string, url: string) => {
    // 解码 URL，避免双重编码
    const decodedUrl = safeDecodeUrl(url)
    return $get<Chapter[]>('/chapters', {
      params: { source, url: decodedUrl },
    })
  },

  // 获取章节内容
  getBookContent: (source: string, url: string) => {
    // 解码 URL，避免双重编码
    const decodedUrl = safeDecodeUrl(url)
    return $get<ChapterContent>('/content', { params: { source, url: decodedUrl } })
  },

  // 搜索书籍 (Nexus-lite 使用 POST /search)
  search: (keyword: string) => $post<SearchResponse>('/search', { keyword }),

  // 保存书籍到书架
  saveBook: (book: {
    sourceId: string
    bookUrl: string
    name: string
    author?: string
    coverUrl?: string
    intro?: string
  }) =>
    $post<Book>('/bookshelf', {
      source_id: book.sourceId,
      book_url: book.bookUrl,
      name: book.name,
      author: book.author,
      cover_url: book.coverUrl,
      intro: book.intro
    }),

  // 从书架删除书籍 (使用 ID)
  deleteBook: (id: string) => $delete(`/bookshelf/${id}`),

  // 获取书籍详细信息
  getBookInfo: (source: string, url: string) => {
    // 解码 URL，避免双重编码（Vue Router hash 模式会自动编码查询参数）
    const decodedUrl = safeDecodeUrl(url)
    return $get<Book>('/book', { params: { source, url: decodedUrl } })
  },

  // 保存阅读进度
  saveBookProgress: (id: string, chapterIndex: number, position: number) =>
    $patch(`/bookshelf/${id}`, { chapter_index: chapterIndex, position }),

  // 移动书籍到分组
  moveToGroup: (id: string, groupId: string | null) =>
    $put(`/bookshelf/${id}`, { group_id: groupId }),

  // 获取发现页数据
  getDiscovery: (period?: string) =>
    $get<DiscoveryResponse>('/discovery', { params: { period } }),
}
