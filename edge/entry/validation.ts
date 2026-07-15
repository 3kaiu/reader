import type { EnhancedWorkerEnv } from '../worker/types.ts'

export function validateWorkerEnv(env: EnhancedWorkerEnv): void {
  if (!env.NEXUS_API_URL) {
    throw new Error('Missing required binding/env: NEXUS_API_URL')
  }
  const apiUrl = String(env.NEXUS_API_URL)
  if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
    throw new Error(`NEXUS_API_URL must start with http:// or https://, got: ${apiUrl}`)
  }
  // Prevent self-referencing loops (workers.dev domains would cause infinite proxy loops)
  if (apiUrl.includes('.workers.dev')) {
    throw new Error(`NEXUS_API_URL must not point to a workers.dev domain: ${apiUrl}`)
  }
}
