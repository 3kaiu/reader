import { getCorsHeaders } from '../shared/cors.ts'

export function getRequestId(request: Request): string {
  return request.headers.get('X-Request-ID') || crypto.randomUUID()
}

export function jsonError(
  request: Request,
  code: string,
  message: string,
  status: number,
  details?: string
): Response {
  const requestId = getRequestId(request)
  const origin = request.headers.get('Origin') || ''
  return new Response(JSON.stringify({
    code,
    message,
    details,
    requestId,
  }), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    }
  })
}

