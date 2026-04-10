import { verifyAuth } from '../../shared/auth.ts'

import type { Progress } from '../../shared/types.ts'
import type {
  ContentManagementSystem,
  QueueProcessor,
  UserPreferencesSystem,
} from '../systems.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { jsonError } from '../http.ts'
import { corsHeaders, getErrorMessage, isJsonObject } from './shared.ts'

function readRequestId(request: Request): string | null {
  return (
    request.headers.get('X-Request-ID') ||
    request.headers.get('x-request-id') ||
    request.headers.get('X-Request-Id')
  )
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export async function handleUserPreferences(
  request: Request,
  env: EnhancedWorkerEnv,
  userPrefs: UserPreferencesSystem
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const userId = payload.id
  if (request.method === 'GET') {
    const preferences = await userPrefs.getPreferences(userId)
    return new Response(JSON.stringify(preferences), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  }

  if (request.method === 'POST') {
    const preferences: unknown = await request.json()
    if (!isJsonObject(preferences)) {
      return jsonError(request, 'BAD_REQUEST', 'Invalid preferences payload', 400)
    }
    await userPrefs.savePreferences(userId, preferences)
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(request) })
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
}

export async function handleContentUpload(
  request: Request,
  env: EnhancedWorkerEnv,
  contentManager: ContentManagementSystem
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return jsonError(request, 'BAD_REQUEST', 'No file provided', 400)
    }

    const content = await file.arrayBuffer()
    const key = await contentManager.uploadUserContent(payload.id, file.name, content)

    return new Response(JSON.stringify({
      success: true,
      key,
      url: `https://content.nexus-reader.pages.dev/${key}`,
    }), { headers: corsHeaders(request) })
  } catch (error: unknown) {
    return jsonError(request, 'UPLOAD_FAILED', 'Upload failed', 500, getErrorMessage(error))
  }
}

export async function handleUserBackup(
  request: Request,
  env: EnhancedWorkerEnv,
  contentManager: ContentManagementSystem,
  queueProcessor: QueueProcessor
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const userId = payload.id
  await queueProcessor.queueBackupRequest(userId)
  const backupKey = await contentManager.createUserBackup(userId)

  return new Response(JSON.stringify({
    success: true,
    backupKey,
    message: 'Backup queued and initial backup created',
  }), { headers: corsHeaders(request) })
}

export async function handleProgressSync(request: Request, env: EnhancedWorkerEnv, url: URL): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const parts = url.pathname.split('/').filter(Boolean)
  const bookId = parts[1]
  if (!bookId) return jsonError(request, 'BAD_REQUEST', 'Missing bookId', 400)

  const key = `progress:${payload.id}:${bookId}`

  if (request.method === 'GET') {
    const value = await env.PROGRESS_KV.get(key)
    if (!value) return jsonError(request, 'NOT_FOUND', 'Not Found', 404)
    try {
      const parsed = JSON.parse(value) as Partial<Progress>
      const normalized: Progress = {
        bookId: typeof parsed.bookId === 'string' ? parsed.bookId : bookId,
        chapterIndex: Math.max(0, Math.trunc(Number(parsed.chapterIndex ?? 0))),
        scrollPercent: clampNumber(Number(parsed.scrollPercent ?? 0), 0, 100),
        scrollKind: parsed.scrollKind === 'chapter' ? 'chapter' : 'document',
        updatedAt: clampNumber(Number(parsed.updatedAt ?? 0), 0, Number.MAX_SAFE_INTEGER),
        ...(typeof parsed.lastRequestId === 'string' ? { lastRequestId: parsed.lastRequestId } : {}),
      }
      return new Response(JSON.stringify(normalized), {
        status: 200,
        headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
      })
    } catch {
      return new Response(value, {
        status: 200,
        headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
      })
    }
  }

  if (request.method === 'DELETE') {
    await env.PROGRESS_KV.delete(key)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  }

  if (request.method !== 'PUT' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) })
  }

  try {
    const body = await request.json() as Partial<Progress>
    const requestId = readRequestId(request)

    const nextCandidate: Progress = {
      bookId,
      chapterIndex: Math.max(0, Math.trunc(Number(body.chapterIndex ?? 0))),
      scrollPercent: clampNumber(Number(body.scrollPercent ?? 0), 0, 100),
      scrollKind: body.scrollKind === 'chapter' ? 'chapter' : 'document',
      // Allow client-provided timestamp for multi-device ordering; fall back to edge clock.
      updatedAt: clampNumber(Number(body.updatedAt ?? Date.now()), 0, Number.MAX_SAFE_INTEGER),
      ...(requestId ? { lastRequestId: requestId } : {}),
    }

    const existingRaw = await env.PROGRESS_KV.get(key)
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as Partial<Progress>
        const existingUpdatedAt = Number(existing.updatedAt ?? 0)
        const existingLastRequestId =
          typeof existing.lastRequestId === 'string' ? existing.lastRequestId : null

        if (requestId && existingLastRequestId === requestId) {
          return new Response(JSON.stringify({ success: true, duplicate: true }), {
            headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
          })
        }

        if (Number.isFinite(existingUpdatedAt) && existingUpdatedAt > nextCandidate.updatedAt) {
          return new Response(JSON.stringify({ success: true, ignored: true }), {
            headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
          })
        }
      } catch {
        // Ignore invalid existing JSON and overwrite with fresh progress.
      }
    }

    await env.PROGRESS_KV.put(key, JSON.stringify(nextCandidate), { expirationTtl: 30 * 24 * 60 * 60 })
    return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid progress payload', 400, getErrorMessage(error))
  }
}
