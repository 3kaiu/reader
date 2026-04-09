import { verifyAuth } from '../../shared/auth.ts'

import type { Progress } from '../../shared/types.ts'
import type {
  AnalyticsSystem,
  ContentManagementSystem,
  QueueProcessor,
  UserPreferencesSystem,
} from '../systems.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { jsonError } from '../http.ts'
import { corsHeaders, getErrorMessage, isJsonObject } from './shared.ts'

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
    return new Response(value, {
      status: 200,
      headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
    })
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

  const body = await request.json() as Partial<Progress>
  const progress: Progress = {
    bookId,
    chapterIndex: Number(body.chapterIndex ?? 0),
    scrollPercent: Number(body.scrollPercent ?? 0),
    updatedAt: Date.now(),
  }

  await env.PROGRESS_KV.put(key, JSON.stringify(progress), { expirationTtl: 30 * 24 * 60 * 60 })
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}
