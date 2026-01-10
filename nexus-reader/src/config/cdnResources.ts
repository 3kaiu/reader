/**
 * CDN资源配置 - 端侧AI优化
 * 定义外部化AI库的CDN加载映射
 */

export interface CDNResource {
  url: string
  globalName: string
  integrity?: string
  fallback?: string[]
}

/**
 * CDN资源映射配置
 */
export const CDN_RESOURCES: Record<string, CDNResource> = {
  // MLC AI WebLLM - 端侧AI推理库
  '@mlc-ai/web-llm': {
    url: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@latest/dist/index.js',
    globalName: 'WebLLM',
    fallback: [
      'https://unpkg.com/@mlc-ai/web-llm@latest/dist/index.js'
    ]
  },

  // HuggingFace Transformers - AI模型库
  '@huggingface/transformers': {
    url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@latest/dist/transformers.min.js',
    globalName: 'HuggingFaceTransformers',
    fallback: [
      'https://unpkg.com/@huggingface/transformers@latest/dist/transformers.min.js'
    ]
  },

  // ONNX Runtime Web - AI推理运行时
  'onnxruntime-web': {
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.min.js',
    globalName: 'ort',
    fallback: [
      'https://unpkg.com/onnxruntime-web@latest/dist/ort.min.js'
    ]
  },

  // Piper TTS Web - 语音合成库
  'piper-tts-web': {
    url: 'https://cdn.jsdelivr.net/npm/piper-tts-web@latest/dist/index.js',
    globalName: 'PiperTTS',
    fallback: [
      'https://unpkg.com/piper-tts-web@latest/dist/index.js'
    ]
  }
}

/**
 * 获取CDN资源配置
 */
export function getCDNResource(packageName: string): CDNResource | null {
  return CDN_RESOURCES[packageName] || null
}

/**
 * 获取所有CDN资源的预加载链接
 */
export function getCDNPreloadLinks(): string[] {
  return Object.values(CDN_RESOURCES).map(resource => resource.url)
}

/**
 * 检查CDN资源是否可用
 */
export async function checkCDNAvailability(packageName: string): Promise<boolean> {
  const resource = getCDNResource(packageName)
  if (!resource) return false

  try {
    const response = await fetch(resource.url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}