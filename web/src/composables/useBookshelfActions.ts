import { useRouter } from 'vue-router'
import { createBookshelfHydrationActions } from '@/composables/bookshelf/hydration-actions'
import { createBookshelfLibraryActions } from '@/composables/bookshelf/library-actions'
import { createBookshelfNavigationActions } from '@/composables/bookshelf/navigation-actions'
import type { BookshelfActionsOptions } from '@/composables/bookshelf/types'
import { useOpenReader } from '@/composables/useOpenReader'

export function useBookshelfActions(options: BookshelfActionsOptions) {
  const router = useRouter()
  const { openReader } = useOpenReader()
  const navigationActions = createBookshelfNavigationActions(router)
  const libraryActions = createBookshelfLibraryActions(options, openReader)
  const hydrationActions = createBookshelfHydrationActions(options)

  return {
    ...libraryActions,
    ...navigationActions,
    ...hydrationActions,
  }
}
