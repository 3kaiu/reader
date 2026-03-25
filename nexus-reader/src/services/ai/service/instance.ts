import { AIServiceManager } from './manager'

let aiServiceManager: AIServiceManager | null = null

export function getAIServiceManager(): AIServiceManager {
  if (!aiServiceManager) {
    aiServiceManager = new AIServiceManager()
  }

  return aiServiceManager
}
