import { ref, shallowRef } from 'vue'
import type { AIServiceState, MLCEngineInterface } from './types'

export function createAIServiceState(): AIServiceState {
  return {
    isSupported: ref(false),
    isLoading: ref(false),
    isModelLoaded: ref(false),
    loadProgress: ref(0),
    loadStatus: ref(''),
    error: ref<string | null>(null),
    currentModel: ref<string | null>(null),
    engine: shallowRef<MLCEngineInterface | null>(null),
  }
}
