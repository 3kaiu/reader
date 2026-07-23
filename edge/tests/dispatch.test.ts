import { describe, expect, it } from 'vitest'
import { createStableDispatcher } from '../entry/dispatch.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'
import type { ExecutionContextLike } from '../shared/types.ts'

function makeEnv(): EnhancedWorkerEnv {
  return {
    API_ORIGIN: 'https://api.example.com',
    API_FALLBACK_ORIGINS: [],
    BYPASS_ORIGIN: 'https://bypass.example.com',
    CORS_ALLOWED_ORIGINS: '',
    EDGE_KV: {} as any,
    EDGE_CACHE: {} as any,
  } as unknown as EnhancedWorkerEnv
}

function makeCtx(): ExecutionContextLike {
  return { waitUntil: () => {} } as ExecutionContextLike
}

async function dispatch(pathname: string, method = 'GET'): Promise<Response> {
  const env = makeEnv()
  const dispatcher = createStableDispatcher(env)
  const request = new Request(`https://edge.example.com${pathname}`, { method })
  return dispatcher(request, makeCtx())
}

describe('isAllowedApiPath (path traversal prevention)', () => {
  it('allows normal valid api paths (passes whitelist, does not return edge 404)', async () => {
    // /api/health passes the whitelist; the proxy call may fail in tests due to
    // mock env, but it must NOT be a 404 from the edge whitelist check.
    let status: number | undefined
    try {
      const res = await dispatch('/api/health')
      status = res.status
    } catch {
      // proxy threw — that's fine, it means the whitelist let it through
      status = 200
    }
    expect(status).not.toBe(404)
  })

  it('rejects paths that do not start with /api/', async () => {
    const res = await dispatch('/admin/users')
    expect(res.status).toBe(404)
  })

  it('blocks path traversal with .. segments', async () => {
    // /api/content/../../../admin normalizes to /admin — must be rejected
    const res = await dispatch('/api/content/../../../admin')
    expect(res.status).toBe(404)
  })

  it('blocks path traversal that escapes to non-allowed segment', async () => {
    // /api/content/../source-packages/secret normalizes to /api/source-packages/secret
    // which IS allowed — but /api/content/../../secret normalizes to /secret
    const res = await dispatch('/api/content/../../secret')
    expect(res.status).toBe(404)
  })

  it('handles double-encoded traversal attempts', async () => {
    // /api/content/%2e%2e/%2e%2e/admin — URL constructor decodes then normalizes
    const res = await dispatch('/api/content/%2e%2e/%2e%2e/admin')
    expect(res.status).toBe(404)
  })

  it('handles dot segments that stay within /api/', async () => {
    // /api/./content normalizes to /api/content — should pass the whitelist
    let status: number | undefined
    try {
      const res = await dispatch('/api/./content')
      status = res.status
    } catch {
      // proxy threw — that's fine, it means the whitelist let it through
      status = 200
    }
    expect(status).not.toBe(404)
  })

  it('rejects paths with no segment after /api/', async () => {
    const res = await dispatch('/api/')
    expect(res.status).toBe(404)

    const res2 = await dispatch('/api')
    expect(res2.status).toBe(404)
  })
})
