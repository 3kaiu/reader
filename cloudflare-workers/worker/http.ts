import { getCorsHeaders } from '../shared/cors.ts'

export const REQUEST_ID_HEADER = 'X-Request-ID'

function readRequestId(headers: Headers): string | null {
  return (
    headers.get(REQUEST_ID_HEADER) ||
    headers.get('x-request-id') ||
    headers.get('X-Request-Id')
  )
}

export function getRequestId(request: Request): string {
  return readRequestId(request.headers) || crypto.randomUUID()
}

export function ensureRequestId(request: Request): { request: Request; requestId: string } {
  const requestId = getRequestId(request)
  const current = readRequestId(request.headers)
  if (current === requestId) {
    return { request, requestId }
  }

  const headers = new Headers(request.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  return {
    request: new Request(request, { headers }),
    requestId,
  }
}

export function attachRequestId(response: Response, requestId: string): Response {
  if (response.headers.get(REQUEST_ID_HEADER) === requestId) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
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
      [REQUEST_ID_HEADER]: requestId,
    }
  })
}
