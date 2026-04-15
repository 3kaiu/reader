export interface DiscoveryItem {
  bookId: string
  name: string
  author?: string
  coverUrl?: string
  bookUrl: string
  intro?: string
  followers?: number
  position: number
}

export interface DiscoverySection {
  section: string
  items: DiscoveryItem[]
}

export interface DiscoveryResponse {
  period: string
  startDate: string
  endDate: string
  sections: DiscoverySection[]
  availablePeriods: string[]
}
