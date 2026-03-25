import type { JsonObject, WorkerQueueMessage } from '../../shared/types.ts'

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isWorkerQueueMessage(value: unknown): value is WorkerQueueMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if (!('type' in value) || !('timestamp' in value) || typeof value.timestamp !== 'string') {
    return false
  }

  if (value.type === 'analytics_event') {
    return (
      'eventType' in value &&
      typeof value.eventType === 'string' &&
      'data' in value &&
      isJsonObject(value.data)
    )
  }

  if (value.type === 'backup_request') {
    return 'userId' in value && typeof value.userId === 'string'
  }

  return false
}

export function parseStoredPreferences(value: string): JsonObject {
  const parsed: unknown = JSON.parse(value)
  return isJsonObject(parsed) ? parsed : {}
}

export function getContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const contentTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    json: 'application/json',
    txt: 'text/plain',
    pdf: 'application/pdf',
  }

  return contentTypes[ext || ''] || 'application/octet-stream'
}
