import type { BookshelfActionsOptions } from './types'

export function createBookshelfHydrationActions(options: BookshelfActionsOptions) {
  async function hydrateBookshelf() {
    await Promise.allSettled([
      options.libraryStore.hydrate(),
      options.offlineStore.loadCacheIndex(),
    ])
  }

  return {
    hydrateBookshelf,
  }
}
