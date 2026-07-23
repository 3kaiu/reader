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
      expect(store.books).toEqual([])
      expect(store.groups).toEqual([])
      expect(store.booksLoaded).toBe(false)
      expect(store.groupsLoaded).toBe(false)
    })

    it('should reset state', () => {
      const store = useLibraryStore()
      store.books = [{ id: '1', name: 'Test' } as any]
      store.groups = [{ id: 'g1', name: 'Group' } as any]

      store.$reset()

      expect(store.books).toEqual([])
      expect(store.groups).toEqual([])
      expect(store.booksLoaded).toBe(false)
    })
  })

  describe('Search Store', () => {
    it('should initialize with default state', () => {
      const store = useSearchStore()
      expect(store.searchKeyword).toBe('')
      expect(store.searchResult).toEqual([])
      expect(store.searchErrors).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.hasSearched).toBe(false)
    })

    it('should reset state including abort controller', () => {
      const store = useSearchStore()
      store.searchKeyword = 'test'
      store.searchResult = [{ id: '1', name: 'Test' } as any]
      store.searchErrors = [{ sourceId: 's1', error: 'err' }]
      store.loading = true
      store.hasSearched = true
      store.selectedSources.add('source1')

      store.$reset()

      expect(store.searchKeyword).toBe('')
      expect(store.searchResult).toEqual([])
      expect(store.searchErrors).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.hasSearched).toBe(false)
      expect(store.selectedSources.size).toBe(0)
    })
  })

  describe('Source Store', () => {
    it('should initialize with empty state', () => {
      const store = useSourceStore()
      expect(store.sources).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.loaded).toBe(false)
    })

    it('should reset state', () => {
      const store = useSourceStore()
      store.sources = [{ id: 's1', bookSourceName: 'Test' } as any]
      store.loading = true
      store.loaded = true

      store.$reset()

      expect(store.sources).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.loaded).toBe(false)
    })
  })

  describe('Replace Store', () => {
    it('should initialize with empty state', () => {
      const store = useReplaceStore()
      expect(store.rules).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.loaded).toBe(false)
    })

    it('should reset state', () => {
      const store = useReplaceStore()
      store.rules = [{ id: 'r1', name: 'Rule', pattern: 'test' } as any]
      store.loading = true
      store.loaded = true

      store.$reset()

      expect(store.rules).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.loaded).toBe(false)
    })
  })
})