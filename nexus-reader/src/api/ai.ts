import { $get, $post, $delete } from './client'
import type { AiAnalysisHistory, AiMappingRule } from '@/types/ai-analysis'

export type { AiAnalysisHistory, AiMappingRule }

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
