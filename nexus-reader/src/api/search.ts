import { $post } from "./client"
import type { SearchResponse, SearchResult } from "@/types/search"

export type { SearchResponse, SearchResult }

export const searchApi = {
  searchBooks: (keyword: string) => $post<SearchResponse>("/search", { keyword }),
}
