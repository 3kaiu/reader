import type { WorkerEnv } from '../shared/types.ts'

// 增强的环境类型定义（统一 Worker 入口与子模块共用）
export interface EnhancedWorkerEnv extends WorkerEnv {
  // D1 Databases (免费SQLite)
  ANALYTICS_DB: any
  USER_PREFERENCES_DB: any

  // R2 Storage (免费对象存储)
  USER_CONTENT_R2: any
  BACKUP_R2: any

  // Queues (免费消息队列)
  ANALYTICS_QUEUE: any

  // Analytics Engine (免费实时分析)
  ANALYTICS_ENGINE: any

  // AI (必须匹配 WorkerEnv)
}
