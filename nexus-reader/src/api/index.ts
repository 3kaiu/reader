// 导出便捷的HTTP方法（从client.ts）
export { $get, $post, $put, $delete, $patch, type ApiResponse } from './client'
export { bookApi } from './book'
export type {
  Book,
  Chapter,
  ChapterContent,
  SearchResult,
  SearchResponse,
  DiscoveryItem,
  DiscoveryResponse,
} from './book'
export { sourceApi } from './source'
export type { BookSource, BookSourceSubscription } from './source'
export { groupApi } from './group'
export type { BookGroup } from './group'
export { replaceApi } from './replace'
export type { ReplaceRule } from './replace'
export { aiApi } from './ai'
export type { AiMappingRule, AiAnalysisHistory } from './ai'
export { voiceApi } from './voice'
export type { VoiceModelMetadata } from './voice'
