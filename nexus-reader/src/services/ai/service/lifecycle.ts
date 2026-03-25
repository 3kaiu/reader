import { logger } from '../../../utils/logger'

export function registerAIServiceBeforeUnload(
  handler: () => void | Promise<void>,
): void {
  if (typeof window === 'undefined') {
    return
  }

  window.addEventListener('beforeunload', () => {
    void handler()
  })
}

export function clearManagedTimer(
  timer: ReturnType<typeof setTimeout> | null,
): ReturnType<typeof setTimeout> | null {
  if (timer) {
    clearTimeout(timer)
  }

  return null
}

export function scheduleManagedTimer(options: {
  timer: ReturnType<typeof setTimeout> | null
  timeout: number
  label: string
  onTrigger: () => void | Promise<void>
}): ReturnType<typeof setTimeout> {
  if (options.timer) {
    clearTimeout(options.timer)
  }

  return setTimeout(async () => {
    logger.info(options.label)
    await options.onTrigger()
  }, options.timeout)
}
