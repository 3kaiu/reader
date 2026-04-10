import { computed } from 'vue'
import type { LibraryStoreState, LibraryStoreView } from './types'

export function createLibraryStoreView(state: LibraryStoreState): LibraryStoreView {
  return {
    bookUrls: computed(() => new Set(state.books.value.map(book => book.bookUrl))),
    isInitialLoading: computed(
      () =>
        (!state.booksLoaded.value || !state.groupsLoaded.value) &&
        (state.loadingBooks.value || state.loadingGroups.value)
    ),
  }
}
