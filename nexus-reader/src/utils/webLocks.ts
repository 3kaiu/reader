type ExclusiveTask<T> = () => Promise<T>

class WebLocks {
  private fallbackLocks = new Map<string, Promise<unknown>>()

  async withExclusive<T>(name: string, task: ExclusiveTask<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return await navigator.locks.request(name, async () => await task())
    }

    const previous = this.fallbackLocks.get(name) || Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => {
      release = resolve
    })

    this.fallbackLocks.set(
      name,
      previous.then(() => current)
    )

    await previous
    try {
      return await task()
    } finally {
      release()
      if (this.fallbackLocks.get(name) === previous.then(() => current)) {
        this.fallbackLocks.delete(name)
      }
    }
  }
}

export const webLocks = new WebLocks()
