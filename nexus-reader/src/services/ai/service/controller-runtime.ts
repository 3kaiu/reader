import {
  clearManagedTimer,
  scheduleManagedTimer,
} from './lifecycle'
import {
  createAIWorker,
  loadWebLLMLibrary,
} from './runtime'
import type { AIServiceState, WebLLMInterface } from './types'
import type { AIServiceControllerRuntime } from './controller-types'

const AUTO_UNLOAD_TIMEOUT = 5 * 60 * 1000

export function createAIServiceControllerRuntime(): AIServiceControllerRuntime {
  return {
    webllm: null,
    aiWorker: null,
    autoUnloadTimer: null,
  }
}

export async function loadManagedWebLLMLibrary(
  runtime: AIServiceControllerRuntime,
  state: AIServiceState,
): Promise<WebLLMInterface> {
  runtime.webllm = await loadWebLLMLibrary(runtime.webllm, state)
  return runtime.webllm
}

export async function createManagedAIWorker(
  runtime: AIServiceControllerRuntime,
): Promise<Worker> {
  runtime.aiWorker = await createAIWorker(runtime.aiWorker)
  return runtime.aiWorker
}

export function clearAIServiceAutoUnloadTimer(
  runtime: AIServiceControllerRuntime,
): void {
  runtime.autoUnloadTimer = clearManagedTimer(runtime.autoUnloadTimer)
}

export function scheduleAIServiceAutoUnloadTimer(
  runtime: AIServiceControllerRuntime,
  onTrigger: () => void | Promise<void>,
): void {
  runtime.autoUnloadTimer = scheduleManagedTimer({
    timer: runtime.autoUnloadTimer,
    timeout: AUTO_UNLOAD_TIMEOUT,
    label: '[AI Service] Auto-unloading model after 5 minutes of inactivity',
    onTrigger,
  })
}
