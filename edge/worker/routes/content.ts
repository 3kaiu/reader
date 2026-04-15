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

function deriveDefaultContentBaseUrl(env: EnhancedWorkerEnv): string {
  if (env.PUBLIC_CONTENT_BASE_URL) {
    return env.PUBLIC_CONTENT_BASE_URL.replace(/\/$/, '')
  }

  try {
    const frontendUrl = new URL(env.FRONTEND_URL)
    const host = frontendUrl.hostname

    if (host === 'nexus.pages.dev') {
      return 'https://content.nexus.pages.dev'
    }
    if (host === 'nexus-reader.pages.dev') {
      return 'https://content.nexus-reader.pages.dev'
    }
  } catch {
    // Ignore malformed FRONTEND_URL and fall back to the legacy content host.
  }

  return 'https://content.nexus-reader.pages.dev'
}

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

function compareProgressOrdering(
  a: { updatedAt: number; lastRequestId?: string | null },
  b: { updatedAt: number; lastRequestId?: string | null }
): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt
  }
  const aId = typeof a.lastRequestId === 'string' ? a.lastRequestId : ''
  const bId = typeof b.lastRequestId === 'string' ? b.lastRequestId : ''
  if (aId === bId) return 0
  return aId < bId ? -1 : 1
}

function normalizeProgressRecord(bookId: string, raw: unknown): Progress {
  const parsed = (raw && typeof raw === 'object' ? (raw as Partial<Progress>) : {}) as Partial<Progress>
  const updatedAt = clampNumber(Number(parsed.updatedAt ?? 0), 0, Number.MAX_SAFE_INTEGER)
  return {
    bookId: typeof parsed.bookId === 'string' ? parsed.bookId : bookId,
    chapterIndex: Math.max(0, Math.trunc(Number(parsed.chapterIndex ?? 0))),
    scrollPercent: clampNumber(Number(parsed.scrollPercent ?? 0), 0, 100),
    scrollKind: parsed.scrollKind === 'chapter' ? 'chapter' : 'document',
    ...(Number.isFinite(Number(parsed.clientUpdatedAt))
      ? { clientUpdatedAt: clampNumber(Number(parsed.clientUpdatedAt), 0, Number.MAX_SAFE_INTEGER) }
      : {}),
    serverUpdatedAt: updatedAt,
    updatedAt,
    ...(typeof parsed.lastRequestId === 'string' ? { lastRequestId: parsed.lastRequestId } : {}),
  }
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
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  }

  if (request.method === 'POST') {
    const preferences: unknown = await request.json()
    if (!isJsonObject(preferences)) {
      return jsonError(request, 'BAD_REQUEST', 'Invalid preferences payload', 400)
    }
    await userPrefs.savePreferences(userId, preferences)
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(request, env) })
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
}

export async function handleContentUpload(
  request: Request,
  env: EnhancedWorkerEnv,
  contentManager: ContentManagementSystem
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
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
      url: `${deriveDefaultContentBaseUrl(env)}/${key}`,
    }), { headers: corsHeaders(request, env) })
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
  }), { headers: corsHeaders(request, env) })
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
      const normalized = normalizeProgressRecord(bookId, JSON.parse(value))
      return new Response(JSON.stringify(normalized), {
        status: 200,
        headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
      })
    } catch {
      return new Response(value, {
        status: 200,
        headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
      })
    }
  }

  if (request.method === 'DELETE') {
    await env.PROGRESS_KV.delete(key)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  }

  if (request.method !== 'PUT' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  try {
    const body = await request.json() as Partial<Progress>
    const requestId = readRequestId(request)
    const serverNow = Date.now()

    const existingRaw = await env.PROGRESS_KV.get(key)
    let existingParsed: Partial<Progress> | null = null
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as Partial<Progress>
        existingParsed = existing
        const existingUpdatedAt = Number(existing.updatedAt ?? 0)
        const existingLastRequestId =
          typeof existing.lastRequestId === 'string' ? existing.lastRequestId : null

        if (requestId && existingLastRequestId === requestId) {
          return new Response(
            JSON.stringify({
              success: true,
              duplicate: true,
              progress: normalizeProgressRecord(bookId, existing),
            }),
            {
            headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
            }
          )
        }

        // LWW/ordering comparison happens after building the candidate write payload.
      } catch {
        // Ignore invalid existing JSON and overwrite with fresh progress.
      }
    }

    const incomingChapterIndex = Math.max(0, Math.trunc(Number(body.chapterIndex ?? 0)))
    const existingChapterIndex =
      existingParsed && typeof existingParsed.chapterIndex === 'number'
        ? Math.max(0, Math.trunc(Number(existingParsed.chapterIndex)))
        : null
    const chapterChanged = existingChapterIndex !== null && existingChapterIndex !== incomingChapterIndex

    const hasIncomingScrollPercent = Object.prototype.hasOwnProperty.call(body, 'scrollPercent')
    const hasIncomingScrollKind = Object.prototype.hasOwnProperty.call(body, 'scrollKind')

    const mergedScrollKind: Progress['scrollKind'] =
      hasIncomingScrollKind && body.scrollKind === 'chapter'
        ? 'chapter'
        : hasIncomingScrollKind
          ? 'document'
          : chapterChanged
            ? 'chapter'
            : existingParsed?.scrollKind === 'chapter'
              ? 'chapter'
              : 'document'

    const mergedScrollPercent =
      hasIncomingScrollPercent && typeof body.scrollPercent === 'number'
        ? clampNumber(Number(body.scrollPercent), 0, 100)
        : chapterChanged
          ? 0
          : clampNumber(Number(existingParsed?.scrollPercent ?? 0), 0, 100)

    const nextCandidate: Progress = {
      bookId,
      chapterIndex: incomingChapterIndex,
      scrollPercent: mergedScrollPercent,
      scrollKind: mergedScrollKind,
      ...(Number.isFinite(Number(body.updatedAt))
        ? { clientUpdatedAt: clampNumber(Number(body.updatedAt), 0, Number.MAX_SAFE_INTEGER) }
        : {}),
      // Server-side ordering to avoid client clock drift.
      updatedAt: clampNumber(serverNow, 0, Number.MAX_SAFE_INTEGER),
      ...(requestId ? { lastRequestId: requestId } : {}),
    }

    if (existingParsed) {
      const existingUpdatedAt = Number(existingParsed.updatedAt ?? 0)
      const existingLastRequestId =
        typeof existingParsed.lastRequestId === 'string' ? existingParsed.lastRequestId : null
      if (
        Number.isFinite(existingUpdatedAt) &&
        compareProgressOrdering(
          { updatedAt: existingUpdatedAt, lastRequestId: existingLastRequestId },
          { updatedAt: nextCandidate.updatedAt, lastRequestId: nextCandidate.lastRequestId }
        ) > 0
      ) {
        return new Response(
          JSON.stringify({
            success: true,
            ignored: true,
            progress: normalizeProgressRecord(bookId, existingParsed),
          }),
          {
            headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
          }
        )
      }
    }

    await env.PROGRESS_KV.put(key, JSON.stringify(nextCandidate), { expirationTtl: 30 * 24 * 60 * 60 })
    return new Response(
      JSON.stringify({
        success: true,
        progress: normalizeProgressRecord(bookId, nextCandidate),
      }),
      {
        headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
      }
    )
  } catch (error: unknown) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid progress payload', 400, getErrorMessage(error))
  }
}
