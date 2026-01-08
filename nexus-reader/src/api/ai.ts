import { $get, $post, $delete } from './client'

export interface AiMappingRule {
    id: string
    original: string
    target: string
    type: string
    confidence: number
    enabled: boolean
    createdAt: number
    usageCount?: number
}

export interface AiAnalysisHistory {
    id: string
    bookTitle: string
    chapterTitle: string
    mappings: AiMappingRule[]
    analyzedAt: number
}

export const aiApi = {
    // Mapping Rules
    getMappings: () => $get<AiMappingRule[]>('/ai/mappings'),
    saveMapping: (rule: AiMappingRule) => $post<void>('/ai/mappings', rule),
    deleteMapping: (id: string) => $delete<void>(`/ai/mappings/${id}`),

    // Analysis History
    getHistory: (limit?: number) => $get<AiAnalysisHistory[]>('/ai/history', { params: { limit } }),
    saveHistory: (history: AiAnalysisHistory) => $post<void>('/ai/history', history),
    clearHistory: () => $delete<void>('/ai/history'),
}
