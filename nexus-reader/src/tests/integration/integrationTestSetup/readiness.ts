import type { ReadyAwareService } from './types'

export function hasReadyMethod(service: unknown): service is ReadyAwareService & { ready: () => boolean } {
  return typeof service === 'object' && service !== null && typeof (service as ReadyAwareService).ready === 'function'
}

export async function waitForServicesReady(
  services: Map<string, unknown>,
  timeout = 30000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const allReady = Array.from(services.keys()).every(serviceName => {
      const service = services.get(serviceName)
      return service !== undefined && (!hasReadyMethod(service) || service.ready())
    })

    if (allReady) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error('Services did not become ready within timeout')
}
