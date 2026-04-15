import { getCorsHeaders } from '../shared/cors.ts'
import { getRequestId, REQUEST_ID_HEADER } from '../shared/request-id.ts'

export { REQUEST_ID_HEADER }

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
      ...getCorsHeaders(origin, undefined),
      'Content-Type': 'application/json',
      [REQUEST_ID_HEADER]: requestId,
    }
  })
}
