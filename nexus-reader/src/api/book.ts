import { $get, $post, $delete, $patch, $put } from './client'

// 安全解码 URL，避免双重编码
// Vue Router hash 模式会自动编码查询参数，但 ofetch 的 params 也会编码
// 所以需要先解码，让 ofetch 重新编码
// 支持处理多次编码的情况（最多尝试 5 次）
function safeDecodeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url
  }
  
  let decoded = url
  let lastValid = url
  let attempts = 0
  const maxAttempts = 5
  
  // 如果 URL 不包含编码字符，直接返回
  if (!decoded.includes('%')) {
    return decoded
  }
  
  // 尝试解码，直到无法继续解码或达到最大尝试次数
  while (attempts < maxAttempts && decoded.includes('%')) {
    try {
      const previous = decoded
      decoded = decodeURIComponent(decoded)
      
      // 如果解码后和之前一样，说明不是编码的，停止
      if (decoded === previous) {
        break
      }
      
      // 验证解码后的 URL 是否是有效的 HTTP/HTTPS URL
      try {
        const urlObj = new URL(decoded)
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          lastValid = decoded
          // 如果还有编码字符，继续尝试
          if (decoded.includes('%')) {
            attempts++
            continue
          }
          // 已经是有效 URL 且没有编码字符，返回
          return decoded
        }
      } catch {
        // URL 解析失败，使用最后一次有效的解码结果
        return lastValid
      }
      
      attempts++
    } catch {
      // 解码失败，返回最后一次有效的解码结果
      return lastValid
    }
  }
  
  // 如果最终解码结果不是有效 URL，返回原始值
  try {
    new URL(decoded)
    return decoded
  } catch {
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
    // 输入验证
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new Error('Source parameter is required and must be a non-empty string')
    }
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('URL parameter is required and must be a non-empty string')
    }
    
    // 解码 URL，避免双重编码
    const decodedUrl = safeDecodeUrl(url)
    return $get<Chapter[]>('/chapters', {
      params: { source: source.trim(), url: decodedUrl },
    })
  },

  // 获取章节内容
  getBookContent: (source: string, url: string) => {
    // 输入验证
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new Error('Source parameter is required and must be a non-empty string')
    }
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('URL parameter is required and must be a non-empty string')
    }
    
    // 解码 URL，避免双重编码
    const decodedUrl = safeDecodeUrl(url)
    return $get<ChapterContent>('/content', { params: { source: source.trim(), url: decodedUrl } })
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
    // 输入验证
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new Error('Source parameter is required and must be a non-empty string')
    }
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('URL parameter is required and must be a non-empty string')
    }
    
    // 基本 URL 格式验证
    try {
      const testUrl = safeDecodeUrl(url)
      const urlObj = new URL(testUrl)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL must use http or https protocol')
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error('Invalid URL format')
      }
      throw e
    }
    
    // 解码 URL，避免双重编码（Vue Router hash 模式会自动编码查询参数）
    const decodedUrl = safeDecodeUrl(url)
    return $get<Book>('/book', { params: { source: source.trim(), url: decodedUrl } })
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
