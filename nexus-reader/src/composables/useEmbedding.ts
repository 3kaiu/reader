/**
 * 🧠 useEmbedding - 端側向量生成
 * 使用 transformers.js + WebGPU 生成文本 Embedding
 */
import { ref } from 'vue'

// 动态导入的模块引用
let transformersModule: any = null

export const embeddingState = {
  isLoading: ref(false),
  progress: ref(0),
  isReady: ref(false),
}

let extractor: any = null

/**
 * 动态加载 transformers 模块
 * 优先使用 CDN 加载的全局变量，回退到动态导入
 */
async function getTransformers() {
  if (!transformersModule) {
    // 优先使用 CDN 加载的全局变量
    if (typeof window !== 'undefined' && (window as any).HuggingFaceTransformers) {
      transformersModule = (window as any).HuggingFaceTransformers
    } else {
      // 回退到动态导入
      transformersModule = await import('@huggingface/transformers')
    }
    // 配置環境
    if (transformersModule.env) {
      transformersModule.env.allowLocalModels = false
      transformersModule.env.useBrowserCache = true
    }
  }
  return transformersModule
}

/**
 * 加載 Embedding 模型
 */
export async function loadEmbeddingModel(modelId = 'Xenova/all-MiniLM-L6-v2') {
  if (embeddingState.isReady.value || embeddingState.isLoading.value) return extractor

  embeddingState.isLoading.value = true
  embeddingState.progress.value = 0

  try {
    const { pipeline } = await getTransformers()
    extractor = await pipeline('feature-extraction', modelId, {
      device: 'webgpu', // 強制使用 WebGPU
      progress_callback: (p: any) => {
        if (p.status === 'progress') {
          embeddingState.progress.value = Math.round(p.progress)
        }
      }
    })
    embeddingState.isReady.value = true
    return extractor
  } catch (e) {
    console.error('[Embedding] 加載失敗，嘗試回退到 CPU:', e)
    try {
      const { pipeline } = await getTransformers()
      extractor = await pipeline('feature-extraction', modelId, {
        device: 'wasm',
      })
      embeddingState.isReady.value = true
      return extractor
    } catch (e2) {
      console.error('[Embedding] 完全加載失敗:', e2)
      throw e2
    }
  } finally {
    embeddingState.isLoading.value = false
  }
}

/**
 * 生成文本向量
 */
export async function embed(text: string): Promise<number[]> {
  const model = await loadEmbeddingModel()
  if (!model) throw new Error('Embedding 模型未就緒')

  const output = await model(text, {
    pooling: 'mean',
    normalize: true,
  })

  return Array.from(output.data) as number[]
}

/**
 * 計算餘弦相似度
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  let dotProduct = 0
  let mag1 = 0
  let mag2 = 0
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i]
    mag1 += v1[i] * v1[i]
    mag2 += v2[i] * v2[i]
  }
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2))
}
