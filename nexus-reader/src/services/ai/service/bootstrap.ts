import { logger } from '../../../utils/logger'
import {
  getAllModels,
} from '../../../stores/ai/models'
import { modelCacheManager } from '../modelCache'
import { getErrorMessage } from './runtime'
import type { AIServiceState } from './types'

async function warmupRecommendedModelCache(): Promise<void> {
  const recommendedModels = (await getAllModels()).filter(
    model => model.recommended,
  )
  const topModels = recommendedModels.slice(0, 2)
  if (topModels.length === 0) {
    return
  }

  await modelCacheManager.warmupCache(topModels.map(model => model.id))
}

export async function initializeAIService(options: {
  state: AIServiceState
  detectWebGPUSupport: () => Promise<boolean>
}): Promise<void> {
  logger.info('[AI Service] Initializing AI service manager...')

  try {
    await modelCacheManager.initialize()

    const supported = await options.detectWebGPUSupport()
    if (!supported) {
      logger.warn(
        '[AI Service] WebGPU not supported, AI features will be limited',
      )
      return
    }

    await warmupRecommendedModelCache()

    logger.info('[AI Service] AI service manager initialized successfully')
  } catch (error: unknown) {
    logger.error('[AI Service] Failed to initialize AI service:', { error })
    options.state.error.value = `初始化失败: ${getErrorMessage(error)}`
  }
}
