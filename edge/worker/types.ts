import type { WorkerEnv } from '../shared/types.ts'

// 增强的环境类型定义（统一 Worker 入口与子模块共用）
export interface EnhancedWorkerEnv extends WorkerEnv {}
