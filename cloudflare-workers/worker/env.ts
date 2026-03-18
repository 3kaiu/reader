import type { EnhancedWorkerEnv } from './types.ts'

export function requireBinding(
  env: EnhancedWorkerEnv,
  key: keyof EnhancedWorkerEnv,
  opts?: { requiredInProd?: boolean }
) {
  const requiredInProd = opts?.requiredInProd ?? true
  const isProd = env.ENVIRONMENT === 'production'
  const ok = Boolean((env as any)[key])
  if (!ok && (!isProd || requiredInProd)) {
    throw new Error(`Missing required binding/env: ${String(key)}`)
  }
}

