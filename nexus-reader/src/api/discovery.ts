import { $get } from "./client"
import type { DiscoveryResponse } from "@/types/discovery"

export type { DiscoveryItem, DiscoverySection, DiscoveryResponse } from "@/types/discovery"

export const discoveryApi = {
  getDiscovery: (period?: string) =>
    $get<DiscoveryResponse>("/discovery", { params: { period } }),
}
