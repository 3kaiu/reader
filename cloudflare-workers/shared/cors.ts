/**
 * CORS Utilities
 * Centralized CORS handling for all workers
 */

const ALLOWED_ORIGINS = [
  'https://nexus-reader.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
];

export function getCorsHeaders(origin: string, allowedOrigins: string[] = ALLOWED_ORIGINS): Record<string, string> {
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCorsPreflightRequest(request: Request): Response {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}
