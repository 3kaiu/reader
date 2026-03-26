import type { Ref, ShallowRef } from 'vue'

declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<GPUAdapter | null>
    }
  }

  interface GPUAdapter {
    // Minimal placeholder to satisfy `@typescript-eslint/no-empty-interface`.
    // Real WebGPU adapter has many more fields; we only need it for typing.
    name?: string
  }
}

export interface WebLLMInterface {
  CreateWebWorkerMLCEngine: (
    worker: Worker,
    modelId: string,
    config?: WebLLMConfig,
  ) => Promise<MLCEngineInterface>
}

export interface MLCEngineInterface {
  unload: () => Promise<void>
  terminate?: () => Promise<void>
}

export interface EngineInitProgressReport {
  progress: number
  text?: string
}

export interface WebLLMConfig {
  initProgressCallback?: (report: EngineInitProgressReport) => void
}

export interface AIServiceState {
  isSupported: Ref<boolean>
  isLoading: Ref<boolean>
  isModelLoaded: Ref<boolean>
  loadProgress: Ref<number>
  loadStatus: Ref<string>
  error: Ref<string | null>
  currentModel: Ref<string | null>
  engine: ShallowRef<MLCEngineInterface | null>
}
