/**
 * 统一API模块
 *
 * 将所有API功能聚合到一个文件中，提供统一的API接口：
 * - 书籍相关API
 * - 书源相关API
 * - AI相关API
 * - 语音相关API
 * - 替换规则API
 * - 分组管理API
 * - 系统管理API
 */

import { api } from '@/utils/unified-utils'

// ===== 类型定义 =====

export interface BookSource {
  id: string
  name: string
  author?: string
  version?: string
  enabled: boolean
}

export interface Book {
  id: string
  sourceId: string
  bookUrl: string
  name: string
  author?: string
  coverUrl?: string
  intro?: string
  chapterIndex?: number
  position?: number
  groupId?: string
}

export interface Chapter {
  title: string
  url: string
  index: number
}

export interface ChapterContent {
  title: string
  content: string
  previousUrl?: string
  nextUrl?: string
}

export interface SearchResponse {
  results: Array<{
    title: string
    author: string
    url: string
    source: string
    coverUrl?: string
  }>
  total: number
}

export interface DiscoveryItem {
  title: string
  author: string
  url: string
  source: string
  coverUrl?: string
  intro?: string
}

export interface DiscoveryResponse {
  books: DiscoveryItem[]
  categories: string[]
}

// ===== 书籍API =====

export const bookApi = {
  // 获取书架书籍列表
  getBookshelf: () => api.get<Book[]>('/bookshelf'),

  // 获取书籍章节列表
  getChapters: (source: string, bookUrl: string) =>
    api.get<Chapter[]>('/chapters', { params: { source: source.trim(), url: bookUrl } }),

  // 获取章节内容
  getChapterContent: (source: string, chapterUrl: string) => {
    // 解码 URL，避免双重编码
    const safeDecodeUrl = (url: string): string => {
      if (!url || typeof url !== 'string') return url
      let decoded = url
      let lastValid = url
      let attempts = 0
      const maxAttempts = 5

      if (!decoded.includes('%')) return decoded

      while (attempts < maxAttempts && decoded.includes('%')) {
        try {
          const previous = decoded
          decoded = decodeURIComponent(decoded)
          if (decoded === previous) break
          lastValid = decoded
          attempts++
        } catch {
          break
        }
      }

      return lastValid
    }

    const decodedUrl = safeDecodeUrl(chapterUrl)
    return api.get<ChapterContent>('/content', {
      params: { source: source.trim(), url: decodedUrl }
    })
  },

  // 搜索书籍
  search: (keyword: string) => api.post<SearchResponse>('/search', { keyword }),

  // 保存书籍到书架
  saveBook: (book: {
    sourceId: string
    bookUrl: string
    name: string
    author?: string
    coverUrl?: string
    intro?: string
  }) => api.post<Book>('/bookshelf', {
    source_id: book.sourceId,
    book_url: book.bookUrl,
    name: book.name,
    author: book.author,
    cover_url: book.coverUrl,
    intro: book.intro
  }),

  // 从书架删除书籍
  deleteBook: (id: string) => api.delete(`/bookshelf/${id}`),

  // 获取书籍详细信息
  getBookInfo: (source: string, url: string) => {
    if (!source || typeof source !== 'string' || !source.trim()) {
      throw new Error('Source parameter is required and must be a non-empty string')
    }
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('URL parameter is required and must be a non-empty string')
    }

    // 解码 URL，避免双重编码（Vue Router hash 模式会自动编码查询参数）
    const safeDecodeUrl = (url: string): string => {
      if (!url || typeof url !== 'string') return url
      let decoded = url
      let lastValid = url
      let attempts = 0
      const maxAttempts = 5

      if (!decoded.includes('%')) return decoded

      while (attempts < maxAttempts && decoded.includes('%')) {
        try {
          const previous = decoded
          decoded = decodeURIComponent(decoded)
          if (decoded === previous) break
          lastValid = decoded
          attempts++
        } catch {
          break
        }
      }

      return lastValid
    }

    const decodedUrl = safeDecodeUrl(url)
    return api.get<Book>('/book', { params: { source: source.trim(), url: decodedUrl } })
  },

  // 保存阅读进度
  saveBookProgress: (id: string, chapterIndex: number, position: number) =>
    api.patch(`/bookshelf/${id}`, { chapter_index: chapterIndex, position }),

  // 移动书籍到分组
  moveToGroup: (id: string, groupId: string | null) =>
    api.put(`/bookshelf/${id}`, { group_id: groupId }),

  // 获取发现页数据
  getDiscovery: (period?: string) =>
    api.get<DiscoveryResponse>('/discovery', { params: { period } }),
}

// ===== 书源API =====

export const sourceApi = {
  // 获取所有书源
  getBookSources: () => api.get<BookSource[]>('/sources'),

  // 获取单个书源
  getBookSource: (id: string) => api.get<BookSource>(`/sources/${id}`),

  // 添加/修改书源 (导入)
  addSource: (source: Partial<BookSource> & Record<string, unknown>) =>
    api.post('/sources', source),

  // 删除书源
  deleteBookSource: (id: string) => api.delete(`/sources/${id}`),

  // 更新书源状态
  updateSourceStatus: (id: string, enabled: boolean) =>
    api.put<BookSource>(`/sources/${id}/status`, { enabled }),
}

// ===== AI API =====

export interface AIRequest {
  prompt: string
  context?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface AIResponse {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export const aiApi = {
  // AI对话
  chat: (request: AIRequest) => api.post<AIResponse>('/ai/chat', request),

  // AI分析
  analyze: (content: string, type: 'summary' | 'insights' | 'tags') =>
    api.post<{ result: string }>('/ai/analyze', { content, type }),

  // AI推荐
  recommend: (userPreferences: Record<string, any>) =>
    api.post<{ recommendations: string[] }>('/ai/recommend', { userPreferences }),
}

// ===== 语音API =====

export interface TTSRequest {
  text: string
  voice?: string
  speed?: number
  pitch?: number
}

export interface TTSResponse {
  audioUrl: string
  duration: number
}

export const voiceApi = {
  // 文本转语音
  synthesize: (request: TTSRequest) => api.post<TTSResponse>('/tts/synthesize', request),

  // 获取语音列表
  getVoices: () => api.get<{ voices: Array<{ id: string; name: string; language: string }> }>('/tts/voices'),

  // 语音设置
  updateSettings: (settings: Record<string, any>) => api.put('/tts/settings', settings),
}

// ===== 替换规则API =====

export interface ReplaceRule {
  id: string
  pattern: string
  replacement: string
  enabled: boolean
  priority: number
}

export const replaceApi = {
  // 获取替换规则列表
  getRules: () => api.get<ReplaceRule[]>('/replace-rules'),

  // 创建替换规则
  createRule: (rule: Omit<ReplaceRule, 'id'>) => api.post<ReplaceRule>('/replace-rules', rule),

  // 更新替换规则
  updateRule: (id: string, rule: Partial<ReplaceRule>) =>
    api.put<ReplaceRule>(`/replace-rules/${id}`, rule),

  // 删除替换规则
  deleteRule: (id: string) => api.delete(`/replace-rules/${id}`),

  // 批量导入规则
  importRules: (rules: ReplaceRule[]) => api.post('/replace-rules/import', { rules }),
}

// ===== 分组管理API =====

export interface BookGroup {
  id: string
  name: string
  description?: string
  color?: string
  sortOrder: number
}

export const groupApi = {
  // 获取分组列表
  getGroups: () => api.get<BookGroup[]>('/groups'),

  // 创建分组
  createGroup: (group: Omit<BookGroup, 'id'>) => api.post<BookGroup>('/groups', group),

  // 更新分组
  updateGroup: (id: string, group: Partial<BookGroup>) =>
    api.put<BookGroup>(`/groups/${id}`, group),

  // 删除分组
  deleteGroup: (id: string) => api.delete(`/groups/${id}`),

  // 重新排序分组
  reorderGroups: (groupIds: string[]) => api.put('/groups/reorder', { groupIds }),
}

// ===== 系统管理API =====

export const systemApi = {
  // 获取系统状态
  getStatus: () => api.get<{
    version: string
    uptime: number
    memory: { used: number; total: number }
    cpu: { usage: number }
  }>('/system/status'),

  // 获取系统配置
  getConfig: () => api.get<Record<string, any>>('/system/config'),

  // 更新系统配置
  updateConfig: (config: Record<string, any>) => api.put('/system/config', config),

  // 获取系统日志
  getLogs: (level?: string, limit?: number) =>
    api.get<{ logs: Array<{ timestamp: string; level: string; message: string }> }>(
      '/system/logs',
      { params: { level, limit } }
    ),

  // 重启系统
  restart: () => api.post('/system/restart', {}),
}

// ===== 默认导出 =====

export default {
  book: bookApi,
  source: sourceApi,
  ai: aiApi,
  voice: voiceApi,
  replace: replaceApi,
  group: groupApi,
  system: systemApi,
}