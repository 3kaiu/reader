import { createLibraryBookActions } from './actions/books'
import { createLibraryActionHelpers } from './actions/helpers'
import { createLibraryLoadingActions } from './actions/loading'
import { createLibraryQueryActions } from './actions/query'
import type { LibraryStoreActions, LibraryStoreState, LibraryStoreView } from './types'

export function createLibraryStoreActions(
  state: LibraryStoreState,
  view: LibraryStoreView
): LibraryStoreActions {
  const helperActions = createLibraryActionHelpers(state)
  const loadingActions = createLibraryLoadingActions(state, {
    markBooksLoaded: helperActions.markBooksLoaded,
    markGroupsLoaded: helperActions.markGroupsLoaded,
  })
  const queryActions = createLibraryQueryActions(state, view)
  const bookActions = createLibraryBookActions({
    books: () => state.books.value,
    setBooks: helperActions.setBooks,
    upsertBook: helperActions.upsertBook,
    findBookByUrl: queryActions.findBookByUrl,
    getBooksByIds: queryActions.getBooksByIds,
    loadBooks: loadingActions.loadBooks,
  })

  return {
    ...loadingActions,
    ...queryActions,
    ...bookActions,
  }
}
