/**
 * 搜索增强 API
 * 调用后端搜索接口获取术语解释
 */
import { $get } from './client'

export interface TermSearchResult {
  term: string
  meaning: string
  category: 'novel' | 'internet' | 'gaming' | 'culture' | 'other'
  source: 'local' | 'search' | 'cache' | 'none'
  related?: string[]
}

export interface BatchSearchResult {
  results: TermSearchResult[]
}

export const searchApi = {
  /**
   * 搜索单个术语
   */
  searchTerm: (term: string, type: 'slang' | 'meme' | 'homophone' = 'slang') =>
    $get<TermSearchResult>(`/api/search/term?term=${encodeURIComponent(term)}&type=${type}`),

  /**
   * 批量搜索术语
   */
  searchBatch: (terms: string[], type: 'slang' | 'meme' | 'homophone' = 'slang') =>
    $get<BatchSearchResult>(`/api/search/batch?terms=${encodeURIComponent(terms.join(','))}&type=${type}`),

  /**
   * 获取本地词库 (调试用)
   */
  getLocalDict: () => $get<{ count: number; terms: string[] }>('/api/search/dict'),
}
