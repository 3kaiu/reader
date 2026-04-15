import type { EnhancedWorkerEnv } from '../worker/types.ts'

export function validateWorkerEnv(env: EnhancedWorkerEnv): void {
  if (!env.NEXUS_LITE_URL) {
    throw new Error('Missing required binding/env: NEXUS_LITE_URL')
  }
}
