import { ref } from 'vue'
import type { LibraryStoreState } from './types'

export function createLibraryStoreState(): LibraryStoreState {
  return {
    books: ref([]),
    groups: ref([]),
    booksLoaded: ref(false),
    groupsLoaded: ref(false),
    loadingBooks: ref(false),
    loadingGroups: ref(false),
  }
}
