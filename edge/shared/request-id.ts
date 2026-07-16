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
