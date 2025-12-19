import { $get, $post } from './client'

// 书籍类型定义
export interface Book {
  bookUrl: string
  name: string
  author: string
  coverUrl?: string
  customCoverUrl?: string
  tocUrl?: string
  origin?: string
  originName?: string
  intro?: string
  kind?: string
  type?: number
  group?: number
  durChapterIndex?: number
  durChapterPos?: number
  durChapterTime?: number
  durChapterTitle?: string
  totalChapterNum?: number
  latestChapterTitle?: string
  canUpdate?: boolean
}

export interface Chapter {
  title: string
  url: string
  index: number
}

export interface SearchResult {
  bookUrl: string
  name: string
  author: string
  coverUrl?: string
  intro?: string
  originName?: string
}

// 书籍相关 API
export const bookApi = {
  // 获取书架
  getBookshelf: (refresh = false) =>
    $get<Book[]>('/getBookshelf', { params: { refresh: refresh ? 1 : 0 } }),

  // 获取章节列表
  getChapterList: (bookUrl: string, refresh = false) =>
    $get<Chapter[]>('/getChapterList', {
      params: { url: bookUrl, refresh: refresh ? 1 : 0 },
    }),

  // 获取章节内容
  getBookContent: (bookUrl: string, index: number) =>
    $get<string>('/getBookContent', { params: { url: bookUrl, index } }),

  // 搜索书籍
  search: (key: string) => $get<SearchResult[]>('/search', { params: { key } }),

  // 保存书籍到书架
  saveBook: (book: Book) => $post<Book>('/saveBook', book),

  // 删除书籍
  deleteBook: (bookUrl: string) => $post('/deleteBook', { url: bookUrl }),

  // 获取书籍信息
  getBookInfo: (bookUrl: string) =>
    $get<Book>('/getBookInfo', { params: { url: bookUrl } }),
}
