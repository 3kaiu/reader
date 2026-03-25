import {
  asNumber,
  asString,
  detectDeviceFromUserAgent,
  estimateBandwidth,
  extractClientIp,
  getCfContext,
  getCurrencyForCountry,
  getLocationFromColo,
  resolveContinent,
} from './helpers.ts'
import type { EdgeLocation, UserContext } from './types.ts'

export function extractUserContext(request: Request): UserContext {
  return {
    ip: extractClientIp(request),
    location: getUserLocation(request),
    device: detectDeviceFromUserAgent(request.headers.get('User-Agent') || ''),
    network: getNetworkInfo(request),
    preferences: extractUserPreferences(request),
  }
}

export function getEdgeLocation(request: Request): EdgeLocation {
  const cf = getCfContext(request)
  const colo = asString(cf.colo, 'UNKNOWN')
  return getLocationFromColo(colo)
}

function getUserLocation(request: Request): EdgeLocation {
  const cf = getCfContext(request)
  const colo = asString(cf.colo, 'UNKNOWN')
  const coloFallback = getLocationFromColo(colo)
  const country = asString(cf.country, coloFallback.country)

  return {
    city: asString(cf.city, coloFallback.city),
    country,
    continent: resolveContinent(cf.continent, country, coloFallback.continent),
    latitude: asNumber(cf.latitude, coloFallback.latitude),
    longitude: asNumber(cf.longitude, coloFallback.longitude),
    colo,
  }
}

function getNetworkInfo(request: Request): UserContext['network'] {
  const cf = getCfContext(request)
  return {
    asn: asNumber(cf.asn, 0),
    isp: asString(cf.asOrganization, 'Unknown'),
    bandwidth: estimateBandwidth(request, cf),
  }
}

function extractUserPreferences(request: Request): UserContext['preferences'] {
  const cf = getCfContext(request)
  const acceptLanguage = request.headers.get('Accept-Language') || 'en-US'

  return {
    language: acceptLanguage.split(',')[0].split('-')[0],
    timezone: asString(cf.timezone, 'UTC'),
    currency: getCurrencyForCountry(asString(cf.country, '')),
  }
}
