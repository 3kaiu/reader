import { $get } from '@/api/client'
import type { FetchOptions } from 'ofetch'

export const syncJourneyService = {
  getClientRoutingAnalytics: <T = unknown>() =>
    $get<T>('/analytics/client-routing', { silent: true } as FetchOptions),
}
