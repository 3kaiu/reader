import { requireBinding } from '../worker/env.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

export function validateWorkerEnv(env: EnhancedWorkerEnv): void {
  requireBinding(env, 'AUTH_SECRET')
  requireBinding(env, 'ANALYTICS_ENGINE')
  requireBinding(env, 'ANALYTICS_DB')
  requireBinding(env, 'USER_PREFERENCES_DB')
  requireBinding(env, 'USER_CONTENT_R2')
  requireBinding(env, 'BACKUP_R2')
  requireBinding(env, 'PROGRESS_KV', { requiredInProd: true })
}
