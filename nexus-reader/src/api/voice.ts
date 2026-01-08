import { $get, $post, $delete } from './client'

export interface VoiceModelMetadata {
    id: string
    name: string
    type: string
    metadata: Record<string, string>
    modelSize: number
    sampleDuration: number
    createdAt: number
    updatedAt: number
}

export const voiceApi = {
    // Model Metadata
    getMetadata: () => $get<VoiceModelMetadata[]>('/voice/metadata'),
    saveMetadata: (model: VoiceModelMetadata) => $post<void>('/voice/metadata', model),
    deleteMetadata: (id: string) => $delete<void>(`/voice/metadata/${id}`),

    // Configuration
    getConfig: (key: string) => $get<string | null>(`/voice/config/${key}`),
    saveConfig: (key: string, value: string) => $post<void>(`/voice/config/${key}`, { value }),
}
