import { requireBinding } from '../worker/env.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

export function validateWorkerEnv(env: EnhancedWorkerEnv): void {
  requireBinding(env, 'NEXUS_LITE_URL')
}
