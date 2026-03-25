import type { BookshelfActionsOptions } from './types'

export function createBookshelfHydrationActions(
  options: BookshelfActionsOptions,
) {
  async function hydrateBookshelf() {
    options.addonsStore.refresh()
    await Promise.allSettled([
      options.libraryStore.hydrate(),
      options.offlineStore.loadCacheIndex(),
    ])
  }

  return {
    hydrateBookshelf,
  }
}
