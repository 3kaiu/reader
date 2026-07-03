import { shallowRef, ref } from 'vue'
import type { LibraryStoreState } from './types'

export function createLibraryStoreState(): LibraryStoreState {
  return {
    books: shallowRef([]),
    groups: shallowRef([]),
    booksLoaded: ref(false),
    groupsLoaded: ref(false),
    loadingBooks: ref(false),
    loadingGroups: ref(false),
  }
}
