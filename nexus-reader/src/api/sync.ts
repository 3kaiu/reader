import { $get, type ApiFetchOptions } from "./client"

type RoutingLatencySummary = {
  samples: number
  p50: number
  p95: number
  avg: number
}

export type ClientRoutingAnalytics = {
  window: string
  routeCounts: Record<string, number>
  routeSharePct: Record<string, number>
  latencySummary: Record<string, RoutingLatencySummary>
  note?: string
}

export const syncApi = {
  getClientRoutingAnalytics: async () => {
    return await $get<ClientRoutingAnalytics>("/analytics/client-routing", {
      silent: true,
    } satisfies ApiFetchOptions)
  },
}
