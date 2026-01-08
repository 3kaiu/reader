/**
 * WebSocket 消息类型定义
 */

// 消息类型
export type WSMessageType =
  | 'result'
  | 'done'
  | 'error'
  | 'sync_log'
  | 'sync_complete'
  | 'pong'
  | 'sys_notification'
  | 'ping'
  | 'cancel_search'

// 通用消息结构
export interface WSMessage<T = unknown> {
  type: WSMessageType
  data?: T
  message?: string
  payload?: Record<string, unknown>
}

// 搜索结果
export interface SearchResult {
  name: string
  author: string
  bookUrl: string
  coverUrl?: string
  intro?: string
  source: string
  kind?: string
}

// 搜索状态
export interface SearchState {
  isSearching: boolean
  results: SearchResult[]
  progress: {
    current: number
    total: number
  }
}

// 同步日志消息
export interface SyncLogPayload {
  message: string
}

// 系统通知消息
export interface SysNotificationPayload {
  title?: string
  message?: string
}
