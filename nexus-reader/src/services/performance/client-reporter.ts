import { logger } from '@/utils/logger'

export type ClientMetric = {
  name: string
  value: number
  unit: 'ms' | 's'
  tags?: Record<string, string | number>
  timestamp?: number
}

const MAX_BUFFER = 200
const FLUSH_INTERVAL_MS = 30_000

const buffer: ClientMetric[] = []
let flushTimer: number | null = null
let flushing = false

function getEndpoint(): string {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
  // If base already points to "/api", avoid double "/api/api".
  if (base.endsWith('/api')) {
    return `${base}/metrics/client`
  }
  return `${base}/api/metrics/client`
}

function ensureFlushTimer() {
  if (flushTimer != null || typeof window === 'undefined') return
  flushTimer = window.setInterval(() => {
    flushClientMetrics().catch(() => { })
  }, FLUSH_INTERVAL_MS)

  window.addEventListener('beforeunload', () => {
    // Best-effort flush on unload.
    void flushClientMetrics({ keepalive: true })
  })
}

function shouldReport(name: string): boolean {
  // Keep volume low: only report routing + latency metrics.
  return (
    name === 'api_response' ||
    name === 'api_error_duration' ||
    name === 'api_route' ||
    name === 'api_response_ms' ||
    name === 'api_direct_fallback'
  )
}

export function queueClientMetric(metric: ClientMetric) {
  if (!shouldReport(metric.name)) return
  ensureFlushTimer()

  buffer.push({ ...metric, timestamp: metric.timestamp ?? Date.now() })
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER)
  }
}

export async function flushClientMetrics(opts?: { keepalive?: boolean }) {
  if (flushing) return
  if (buffer.length === 0) return
  if (typeof window === 'undefined') return

  const endpoint = getEndpoint()
  const token = localStorage.getItem('nexus_auth_token')

  const batch = buffer.splice(0, buffer.length)
  flushing = true
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        metrics: batch,
        userAgent: navigator.userAgent,
        page: location.pathname,
      }),
      keepalive: opts?.keepalive === true,
    })
  } catch (e) {
    // Put them back (best-effort) so we can retry later.
    buffer.unshift(...batch)
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER)
    logger.debug('[PerfReporter] flush failed', e as Error)
  } finally {
    flushing = false
  }
}

