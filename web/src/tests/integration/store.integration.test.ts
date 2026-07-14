/**
 * Store Integration Tests
 *
 * Tests Pinia stores working together with API layer and services
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLibraryStore } from '@/stores/library'
import { useSearchStore } from '@/stores/search'
import { useSourceStore } from '@/stores/source'
import { useReplaceStore } from '@/stores/replace'

vi.mock('@/api/search', () => ({
  searchApi: {
    searchBooksStream: vi.fn(),
    searchBooks: vi.fn(),
  },
}))

vi.mock('@/api/library', () => ({
  libraryApi: {
    fetchBooks: vi.fn(),
    fetchGroups: vi.fn(),
    addBook: vi.fn(),
    deleteBooks: vi.fn(),
    moveBooksToGroup: vi.fn(),
  },
}))

vi.mock('@/api/source', () => ({
  sourceApi: {
    fetchSources: vi.fn(),
    importSources: vi.fn(),
    deleteSource: vi.fn(),
  },
}))

vi.mock('@/api/replace', () => ({
  replaceApi: {
    fetchRules: vi.fn(),
    saveRule: vi.fn(),
    deleteRules: vi.fn(),
    importRules: vi.fn(),
  },
}))

vi.mock('@/api/settings', () => ({
  settingsApi: {
    fetchConfig: vi.fn(),
    saveConfig: vi.fn(),
  },
}))

vi.mock('@/api/http/types', () => ({
  ApiResponse: class {
    constructor(public isSuccess: boolean, public data?: unknown, public error?: string) {}
  },
}))

describe('Store Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Library Store', () => {
    it('should initialize with empty state', () => {
      const store = useLibraryStore()
      expect(store.books.value).toEqual([])
      expect(store.groups.value).toEqual([])
      expect(store.booksLoaded.value).toBe(false)
      expect(store.groupsLoaded.value).toBe(false)
    })

    it('should reset state', () => {
      const store = useLibraryStore()
      store.books.value = [{ id: '1', name: 'Test' } as any]
      store.groups.value = [{ id: 'g1', name: 'Group' } as any]

      store.$reset()

      expect(store.books.value).toEqual([])
      expect(store.groups.value).toEqual([])
      expect(store.booksLoaded.value).toBe(false)
    })
  })

  describe('Search Store', () => {
    it('should initialize with default state', () => {
      const store = useSearchStore()
      expect(store.searchKeyword.value).toBe('')
      expect(store.searchResult.value).toEqual([])
      expect(store.searchErrors.value).toEqual([])
      expect(store.loading.value).toBe(false)
      expect(store.hasSearched.value).toBe(false)
    })

    it('should reset state including abort controller', () => {
      const store = useSearchStore()
      store.searchKeyword.value = 'test'
      store.searchResult.value = [{ id: '1', name: 'Test' } as any]
      store.searchErrors.value = [{ sourceId: 's1', error: 'err' }]
      store.loading.value = true
      store.hasSearched.value = true
      store.selectedSources.value.add('source1')

      store.$reset()

      expect(store.searchKeyword.value).toBe('')
      expect(store.searchResult.value).toEqual([])
      expect(store.searchErrors.value).toEqual([])
      expect(store.loading.value).toBe(false)
      expect(store.hasSearched.value).toBe(false)
      expect(store.selectedSources.value.size).toBe(0)
    })
  })

  describe('Source Store', () => {
    it('should initialize with empty state', () => {
      const store = useSourceStore()
      expect(store.sources.value).toEqual([])
      expect(store.loading.value).toBe(false)
      expect(store.loaded.value).toBe(false)
    })

    it('should reset state', () => {
      const store = useSourceStore()
      store.sources.value = [{ id: 's1', bookSourceName: 'Test' } as any]
      store.loading.value = true
      store.loaded.value = true

      store.$reset()

      expect(store.sources.value).toEqual([])
      expect(store.loading.value).toBe(false)
      expect(store.loaded.value).toBe(false)
    })
  })

  describe('Replace Store', () => {
    it('should initialize with empty state', () => {
      const store = useReplaceStore()
      expect(store.rules.value).toEqual([])
      expect(store.loading.value).toBe(false)
      expect(store.loaded.value).toBe(false)
    })

    it('should reset state', () => {
      const store = useReplaceStore()
      store.rules.value = [{ id: 'r1', name: 'Rule', pattern: 'test' } as any]
      store.loading.value = true
      store.loaded.value = true

      store.$reset()

      expect(store.rules.value).toEqual([])
      expect(store.loading.value).toBe(false)
      expect(store.loaded.value).toBe(false)
    })
  })
})