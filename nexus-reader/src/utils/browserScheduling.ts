type SchedulerLike = {
  postTask?: (
    callback: () => void,
    options?: {
      priority?: 'user-blocking' | 'user-visible' | 'background'
      signal?: AbortSignal
      delay?: number
    },
  ) => Promise<unknown>
}

type InputPendingNavigator = Navigator & {
  scheduling?: {
    isInputPending?: (options?: { includeContinuous?: boolean }) => boolean
  }
}

const FALLBACK_IDLE_TIMEOUT_MS = 120

export type IdleTaskHandle = {
  cancel: () => void
}

export function hasPendingUserInput(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const scheduling = (navigator as InputPendingNavigator).scheduling
  if (typeof scheduling?.isInputPending !== 'function') {
    return false
  }

  try {
    return Boolean(scheduling.isInputPending({ includeContinuous: true }))
  } catch {
    return false
  }
}

export function scheduleIdleTask(
  callback: () => void,
  options: {
    timeoutMs?: number
    preferBackgroundTask?: boolean
  } = {},
): IdleTaskHandle {
  const timeoutMs = options.timeoutMs ?? FALLBACK_IDLE_TIMEOUT_MS
  const preferBackgroundTask = options.preferBackgroundTask !== false
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let idleHandle: number | null = null
  let abortController: AbortController | null = null
  let settled = false

  const runOnce = () => {
    if (settled) {
      return
    }
    settled = true
    callback()
  }

  const cancel = () => {
    settled = true
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (idleHandle !== null && typeof window !== 'undefined' && window.cancelIdleCallback) {
      window.cancelIdleCallback(idleHandle)
      idleHandle = null
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  if (preferBackgroundTask) {
    const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler
    if (scheduler?.postTask) {
      abortController = new AbortController()
      void scheduler
        .postTask(runOnce, {
          priority: 'background',
          signal: abortController.signal,
        })
        .catch(() => undefined)
      return { cancel }
    }
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    idleHandle = window.requestIdleCallback(() => runOnce(), { timeout: timeoutMs })
    return { cancel }
  }

  timeoutHandle = setTimeout(runOnce, timeoutMs)
  return { cancel }
}
