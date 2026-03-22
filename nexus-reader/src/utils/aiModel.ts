export type AiModelSeries = 'qwen' | 'llama' | 'default'

export function getAiModelSeries(modelId: string): AiModelSeries {
  const normalizedId = modelId.toLowerCase()

  if (normalizedId.includes('qwen')) {
    return 'qwen'
  }

  if (normalizedId.includes('llama')) {
    return 'llama'
  }

  return 'default'
}
