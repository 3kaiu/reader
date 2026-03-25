import type {
  CfContext,
  EdgeAnalytics,
  EdgeLocation,
  GlobalEdgeMetrics,
  RequestWithCf,
  UserContext,
} from './types.ts'

const COLO_MAP: Record<string, EdgeLocation> = {
  LAX: {
    city: 'Los Angeles',
    country: 'United States',
    continent: 'North America',
    latitude: 33.9425,
    longitude: -118.4081,
    colo: 'LAX',
  },
  NRT: {
    city: 'Tokyo',
    country: 'Japan',
    continent: 'Asia',
    latitude: 35.6895,
    longitude: 139.6917,
    colo: 'NRT',
  },
  FRA: {
    city: 'Frankfurt',
    country: 'Germany',
    continent: 'Europe',
    latitude: 50.1109,
    longitude: 8.6821,
    colo: 'FRA',
  },
  SIN: {
    city: 'Singapore',
    country: 'Singapore',
    continent: 'Asia',
    latitude: 1.3521,
    longitude: 103.8198,
    colo: 'SIN',
  },
  BOM: {
    city: 'Mumbai',
    country: 'India',
    continent: 'Asia',
    latitude: 19.076,
    longitude: 72.8777,
    colo: 'BOM',
  },
}

const CONTINENT_BY_COUNTRY_CODE: Record<string, string> = {
  CN: 'Asia',
  JP: 'Asia',
  KR: 'Asia',
  SG: 'Asia',
  IN: 'Asia',
  DE: 'Europe',
  FR: 'Europe',
  GB: 'Europe',
  US: 'North America',
  CA: 'North America',
  BR: 'South America',
  AU: 'Oceania',
}

const CURRENCY_BY_COUNTRY_CODE: Record<string, string> = {
  CN: 'CNY',
  JP: 'JPY',
  KR: 'KRW',
  SG: 'SGD',
  IN: 'INR',
  DE: 'EUR',
  FR: 'EUR',
  GB: 'GBP',
  US: 'USD',
  CA: 'CAD',
  BR: 'BRL',
  AU: 'AUD',
}

export function getCfContext(request: Request): CfContext {
  return (request as RequestWithCf).cf || {}
}

export function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }
  return fallback
}

export function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function getLocationFromColo(colo: string): EdgeLocation {
  return COLO_MAP[colo] || {
    city: 'Unknown',
    country: 'Unknown',
    continent: 'Unknown',
    latitude: 0,
    longitude: 0,
    colo,
  }
}

export function resolveContinent(continent: unknown, country: string, fallback: string): string {
  const direct = asString(continent, '')
  if (direct) return direct

  return CONTINENT_BY_COUNTRY_CODE[country.toUpperCase()] || fallback
}

export function getCurrencyForCountry(country: string): string {
  return CURRENCY_BY_COUNTRY_CODE[country.toUpperCase()] || 'USD'
}

export function extractClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    request.headers.get('X-Real-IP') ||
    'unknown'
  )
}

export function detectDeviceFromUserAgent(userAgent: string): UserContext['device'] {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
  const isTablet = /iPad|Android(?=.*\bMobile\b)|Tablet/i.test(userAgent)

  let deviceType: UserContext['device']['type'] = 'desktop'
  if (isTablet) deviceType = 'tablet'
  else if (isMobile) deviceType = 'mobile'

  let os = 'Unknown'
  if (userAgent.includes('Windows')) os = 'Windows'
  else if (userAgent.includes('Mac')) os = 'macOS'
  else if (userAgent.includes('Linux')) os = 'Linux'
  else if (userAgent.includes('Android')) os = 'Android'
  else if (userAgent.includes('iOS')) os = 'iOS'

  let browser = 'Unknown'
  if (userAgent.includes('Chrome')) browser = 'Chrome'
  else if (userAgent.includes('Firefox')) browser = 'Firefox'
  else if (userAgent.includes('Safari')) browser = 'Safari'
  else if (userAgent.includes('Edge')) browser = 'Edge'

  return { type: deviceType, os, browser }
}

export function estimateBandwidth(request: Request, cf: CfContext): number {
  const downlink = asNumber(request.headers.get('Downlink'), 0)
  if (downlink > 0) return downlink

  const ect = (request.headers.get('ECT') || '').toLowerCase()
  const byEct: Record<string, number> = {
    'slow-2g': 0.15,
    '2g': 0.5,
    '3g': 1.6,
    '4g': 12,
  }
  if (byEct[ect]) return byEct[ect]

  const proto = asString(cf.httpProtocol, '').toUpperCase()
  let baseline = 8
  if (proto.includes('H3')) baseline = 25
  else if (proto.includes('H2')) baseline = 15

  const saveData = (request.headers.get('Save-Data') || '').toLowerCase() === 'on'
  return saveData ? Math.max(1, baseline / 2) : baseline
}

export function updateMean(previous: number, sample: number, count: number): number {
  const safeCount = Math.max(1, count)
  return previous + (sample - previous) / safeCount
}

export function calculateUserSatisfaction(
  latency: number,
  errorRate: number,
  cacheHitRate: number
): number {
  const latencyPenalty = Math.min(40, latency / 40)
  const errorPenalty = Math.min(50, errorRate * 100)
  const cacheBonus = Math.min(10, cacheHitRate * 10)
  const score = 100 - latencyPenalty - errorPenalty + cacheBonus
  return Math.max(0, Math.min(100, Number(score.toFixed(2))))
}

export function calculateGlobalMetrics(analytics: EdgeAnalytics[]): GlobalEdgeMetrics {
  if (analytics.length === 0) {
    return {
      totalRequests: 0,
      averageLatency: 0,
      averageErrorRate: 0,
      averageCacheHitRate: 0,
      averageUserSatisfaction: 100,
      totalBandwidthUsage: 0,
      locations: 0,
    }
  }

  const locations = analytics.length
  return {
    totalRequests: analytics.reduce((sum, item) => sum + item.requestCount, 0),
    averageLatency: analytics.reduce((sum, item) => sum + item.averageLatency, 0) / locations,
    averageErrorRate: analytics.reduce((sum, item) => sum + item.errorRate, 0) / locations,
    averageCacheHitRate: analytics.reduce((sum, item) => sum + item.cacheHitRate, 0) / locations,
    averageUserSatisfaction: analytics.reduce((sum, item) => sum + item.userSatisfaction, 0) / locations,
    totalBandwidthUsage: analytics.reduce((sum, item) => sum + item.bandwidthUsage, 0),
    locations,
  }
}

export function getBandwidthBucket(bandwidth: number): 'low' | 'medium' | 'high' {
  if (bandwidth < 5) return 'low'
  if (bandwidth < 20) return 'medium'
  return 'high'
}
